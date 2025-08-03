# labs/bouncr/dashboard.py

import streamlit as st
import yaml
import pandas as pd
import sqlite3
import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from io import StringIO
import csv
import streamlit.components.v1 as components

# Import authentication system
from auth import BouncerAuth, require_auth, show_user_header, show_user_management, logout_user

# File paths
CONFIG_PATH = Path("labs/bouncr/config.yaml")
REVIEWERS_PATH = Path("labs/bouncr/reviewers.yaml")
OVERRIDES_PATH = Path("labs/bouncr/overrides.yaml")
BACKUP_DIR = Path("labs/bouncr/backups")
DB_PATH = Path("labs/bouncr/bouncr.db")
LOGS_DIR = Path("labs/bouncr/logs")
EXPORTS_DIR = Path("labs/bouncr/exports")

# Create directories if they don't exist
LOGS_DIR.mkdir(exist_ok=True)
EXPORTS_DIR.mkdir(exist_ok=True)

CONFIG_FILES = {
    "config": CONFIG_PATH,
    "reviewers": REVIEWERS_PATH,
    "overrides": OVERRIDES_PATH,
}

# Initialize authentication
auth = BouncerAuth()

# Check authentication
session_id = st.session_state.get("session_id")
current_user = auth.validate_session(session_id) if session_id else None

if not current_user:
    from auth import show_login_page
    show_login_page(auth)
    st.stop()

# Store current user in session state
st.session_state["current_user"] = current_user

st.set_page_config(page_title="Bouncr Dashboard", layout="wide", page_icon="🛡️")

# Custom CSS for better UI
st.markdown("""
<style>
    .stAlert > div {
        padding: 0.5rem 1rem;
    }
    .metric-card {
        background: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        margin: 0.5rem 0;
    }
    .status-pending { color: #ff6b6b; }
    .status-approved { color: #51cf66; }
    .status-rejected { color: #ffd43b; }
    .user-header {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 0.5rem;
        margin-bottom: 1rem;
        border-left: 4px solid #007bff;
    }
    .constellation-container {
        background: radial-gradient(circle at center, #1a1f3a 0%, #0a0e1a 100%);
        border-radius: 12px;
        padding: 20px;
        margin: 20px 0;
    }
</style>
""", unsafe_allow_html=True)

# Helper functions
def load_yaml_safe(path: Path):
    """Safely load YAML file with error handling"""
    try:
        if path.exists():
            return yaml.safe_load(path.read_text())
        return {}
    except Exception as e:
        st.error(f"Error loading {path.name}: {e}")
        return {}

def save_yaml_safe(path: Path, data: dict):
    """Safely save YAML file with backup"""
    try:
        # Validate YAML first
        yaml.safe_load(yaml.dump(data))
        
        # Create backup if file exists
        if path.exists():
            backup_path = path.with_suffix(f".backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}.yaml")
            shutil.copy(path, backup_path)
        
        # Write new content
        path.write_text(yaml.dump(data, default_flow_style=False))
        return True
    except Exception as e:
        st.error(f"Error saving {path.name}: {e}")
        return False

def init_database():
    """Initialize SQLite database if it doesn't exist"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create table if it doesn't exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            user_email TEXT,
            app TEXT,
            group_name TEXT,
            last_login TEXT,
            reasons TEXT,
            status TEXT DEFAULT 'pending',
            status_updated_at TEXT,
            reviewer_email TEXT,
            reviewer_comments TEXT
        )
    ''')
    
    # Add missing columns if they don't exist
    try:
        cursor.execute("ALTER TABLE reviews ADD COLUMN reviewer_email TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    try:
        cursor.execute("ALTER TABLE reviews ADD COLUMN reviewer_comments TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    try:
        cursor.execute("ALTER TABLE reviews ADD COLUMN status_updated_at TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    conn.commit()
    conn.close()

def get_review_data():
    """Fetch all review data from database"""
    init_database()
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("""
        SELECT * FROM reviews 
        ORDER BY timestamp DESC
    """, conn)
    conn.close()
    return df

def update_review_status(review_id: int, status: str, reviewer_email: str, comments: str = ""):
    """Update review status in database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE reviews 
        SET status = ?, status_updated_at = ?, reviewer_email = ?, reviewer_comments = ?
        WHERE id = ?
    """, (status, datetime.now().isoformat(), reviewer_email, comments, review_id))
    conn.commit()
    conn.close()

def get_reviewer_assignments():
    """Get reviewer assignments from config"""
    reviewers_config = load_yaml_safe(REVIEWERS_PATH)
    return reviewers_config.get('reviewers', {})

def generate_audit_log(action: str, details: str = ""):
    """Generate audit log entry"""
    timestamp = datetime.now().isoformat()
    log_entry = {
        "timestamp": timestamp,
        "action": action,
        "user": current_user.get("username", "unknown"),
        "user_email": current_user.get("email", "unknown"),
        "details": details
    }
    
    log_file = LOGS_DIR / f"audit_{datetime.now().strftime('%Y%m')}.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")

def check_permission(required_permission: str) -> bool:
    """Check if current user has required permission"""
    user_permissions = current_user.get("permissions", [])
    return auth.has_permission(user_permissions, required_permission)

def transform_review_data_for_constellation(df):
    """Transform review data to constellation format"""
    if df.empty:
        return []
    
    # Group by team and create constellation data
    constellation_data = []
    for group_name in df['group_name'].unique():
        group_data = df[df['group_name'] == group_name]
        
        users = []
        for _, row in group_data.iterrows():
            users.append({
                'id': f"u_{row['id']}",
                'name': row['user_email'].split('@')[0],
                'email': row['user_email'],
                'role': 'Member',  # Could be enhanced based on your data
                'accessLevel': 2,
                'usage': 50,  # Placeholder - could calculate from actual usage
                'lastLogin': row['last_login'],
                'app': row['app'],
                'alert': row['status'] == 'pending',
                'status': row['status']
            })
        
        constellation_data.append({
            'name': group_name,
            'users': users
        })
    
    return constellation_data

def create_constellation_map_html(data, view_filter='all'):
    """Create HTML for the constellation map"""
    
    # Filter data if needed
    if view_filter != 'all':
        data = [group for group in data if group['name'].lower() == view_filter.lower()]
    
    # Create HTML with embedded D3.js visualization
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
        <style>
            body {{ margin: 0; padding: 20px; background: #0a0e1a; color: white; font-family: Arial; }}
            .constellation-container {{ 
                width: 100%; 
                height: 500px; 
                background: radial-gradient(circle at center, #1a1f3a 0%, #0a0e1a 100%);
                border-radius: 12px;
                position: relative;
            }}
            .user-node {{ cursor: pointer; }}
            .group-label {{ font-size: 14px; font-weight: bold; fill: #64c8ff; text-anchor: middle; }}
            .tooltip {{ 
                position: absolute; 
                background: rgba(0,0,0,0.9); 
                border: 1px solid #64c8ff;
                border-radius: 8px; 
                padding: 10px; 
                font-size: 12px; 
                pointer-events: none;
                display: none;
            }}
        </style>
    </head>
    <body>
        <div class="constellation-container" id="constellation"></div>
        <div class="tooltip" id="tooltip"></div>
        
        <script>
            const data = {json.dumps(data)};
            const width = 800;
            const height = 500;
            
            const svg = d3.select("#constellation")
                .append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", `0 0 ${{width}} ${{height}}`);
            
            const roleColors = {{
                "Member": "#4ecdc4",
                "Reviewer": "#ffe066", 
                "Group Leader": "#ff6b6b",
                "Admin": "#a55eea"
            }};
            
            // Add background stars
            for (let i = 0; i < 30; i++) {{
                svg.append("circle")
                    .attr("cx", Math.random() * width)
                    .attr("cy", Math.random() * height)
                    .attr("r", Math.random() * 2)
                    .attr("fill", "rgba(255, 255, 255, 0.3)");
            }}
            
            // Position groups
            data.forEach((group, groupIndex) => {{
                const groupAngle = (groupIndex / data.length) * 2 * Math.PI;
                const groupRadius = Math.min(width, height) * 0.25;
                const centerX = width / 2;
                const centerY = height / 2;
                
                const groupCenterX = centerX + Math.cos(groupAngle) * groupRadius;
                const groupCenterY = centerY + Math.sin(groupAngle) * groupRadius;
                
                // Group boundary
                svg.append("circle")
                    .attr("cx", groupCenterX)
                    .attr("cy", groupCenterY)
                    .attr("r", 80)
                    .attr("fill", "rgba(100, 200, 255, 0.05)")
                    .attr("stroke", "rgba(100, 200, 255, 0.3)")
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", "3,3");
                
                // Group label
                svg.append("text")
                    .attr("class", "group-label")
                    .attr("x", groupCenterX)
                    .attr("y", groupCenterY - 100)
                    .text(group.name);
                
                // Users
                group.users.forEach((user, userIndex) => {{
                    const userAngle = (userIndex / Math.max(group.users.length, 4)) * 2 * Math.PI;
                    const userRadius = (user.accessLevel / 4) * 60;
                    
                    const userX = groupCenterX + Math.cos(userAngle) * userRadius;
                    const userY = groupCenterY + Math.sin(userAngle) * userRadius;
                    const nodeSize = Math.max(6, user.usage / 8);
                    
                    // Alert indicator
                    if (user.alert) {{
                        svg.append("circle")
                            .attr("cx", userX)
                            .attr("cy", userY)
                            .attr("r", nodeSize + 3)
                            .attr("fill", "#ff6b6b")
                            .attr("opacity", 0.7)
                            .append("animate")
                            .attr("attributeName", "opacity")
                            .attr("values", "0.3;1;0.3")
                            .attr("dur", "2s")
                            .attr("repeatCount", "indefinite");
                    }}
                    
                    // User node
                    svg.append("circle")
                        .attr("class", "user-node")
                        .attr("cx", userX)
                        .attr("cy", userY)
                        .attr("r", nodeSize)
                        .attr("fill", roleColors[user.role] || "#4ecdc4")
                        .attr("stroke", "white")
                        .attr("stroke-width", 1)
                        .on("mouseover", function(event) {{
                            const tooltip = d3.select("#tooltip");
                            tooltip.style("display", "block")
                                .html(`
                                    <strong>${{user.name}}</strong><br>
                                    Email: ${{user.email}}<br>
                                    App: ${{user.app}}<br>
                                    Status: ${{user.status}}<br>
                                    Last Login: ${{user.lastLogin}}
                                    ${{user.alert ? '<br><span style="color: #ff6b6b;">⚠️ Needs Review</span>' : ''}}
                                `)
                                .style("left", (event.pageX + 10) + "px")
                                .style("top", (event.pageY - 10) + "px");
                        }})
                        .on("mouseout", function() {{
                            d3.select("#tooltip").style("display", "none");
                        }});
                    
                    // User initials
                    svg.append("text")
                        .attr("x", userX)
                        .attr("y", userY + 3)
                        .attr("text-anchor", "middle")
                        .attr("fill", "white")
                        .attr("font-size", Math.max(8, nodeSize/2))
                        .attr("font-weight", "bold")
                        .style("pointer-events", "none")
                        .text(user.name.substring(0, 2).toUpperCase());
                }});
            }});
        </script>
    </body>
    </html>
    """
    
    return html_content

# Main app
st.title("🛡️ Bouncr Access Review Dashboard")

# Show user header
show_user_header()

# Generate audit log for this session
generate_audit_log("dashboard_access", "User accessed dashboard")

# Load review data for constellation map
try:
    df = get_review_data()
    constellation_data = transform_review_data_for_constellation(df)
    
    # Metrics calculation
    if not df.empty:
        total_members = len(df['user_email'].unique())
        pending_count = len(df[df['status'] == 'pending'])
        approved_count = len(df[df['status'] == 'approved'])
        rejected_count = len(df[df['status'] == 'rejected'])
    else:
        total_members = pending_count = approved_count = rejected_count = 0
        
except Exception as e:
    st.error(f"Error loading data: {e}")
    constellation_data = []
    total_members = pending_count = approved_count = rejected_count = 0

# ===== NEW: ACCESS CONSTELLATION MAP SECTION =====
st.header("🌟 Access Overview")

# View selector for constellation map
col1, col2 = st.columns([3, 1])
with col2:
    view_filter = st.selectbox(
        "View", 
        ["all", "engineering", "finance", "sales", "devops"],
        format_func=lambda x: x.title() if x != "all" else "All Teams"
    )

# Display constellation map
if constellation_data:
    constellation_html = create_constellation_map_html(constellation_data, view_filter)
    components.html(constellation_html, height=550)
else:
    st.info("🔍 No access data available. Run a review cycle to populate the constellation map.")

# Updated metrics cards (now responsive to view filter)
st.header("📊 Metrics Overview")

if view_filter != "all" and constellation_data:
    # Filter metrics by selected view
    filtered_df = df[df['group_name'].str.lower() == view_filter.lower()] if not df.empty else pd.DataFrame()
    if not filtered_df.empty:
        total_members = len(filtered_df['user_email'].unique())
        pending_count = len(filtered_df[filtered_df['status'] == 'pending'])
        approved_count = len(filtered_df[filtered_df['status'] == 'approved'])
        rejected_count = len(filtered_df[filtered_df['status'] == 'rejected'])

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric(
        label="Total Members",
        value=total_members,
        help="Total unique users in current view"
    )

with col2:
    st.metric(
        label="Pending Reviews", 
        value=pending_count,
        delta=f"{pending_count} need attention" if pending_count > 0 else "All caught up!",
        delta_color="inverse"
    )

with col3:
    st.metric(
        label="Approved",
        value=approved_count,
        delta=f"{approved_count} verified" if approved_count > 0 else None
    )

with col4:
    st.metric(
        label="Rejected", 
        value=rejected_count,
        delta=f"{rejected_count} access removed" if rejected_count > 0 else None,
        delta_color="inverse"
    )

# Sidebar for quick metrics and user info
with st.sidebar:
    st.header("📊 Quick Metrics")
    
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Pending", pending_count)
    with col2:
        st.metric("Approved", approved_count)
    with col3:
        st.metric("Rejected", rejected_count)
    
    st.markdown("---")
    st.markdown("**Current User**")
    st.write(f"👤 {current_user.get('name', 'User')}")
    st.write(f"🏷️ {current_user.get('role', 'user').title()}")
    
    st.markdown("---")
    st.markdown("**Session Info**")
    st.caption(f"Last Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

# Determine which tabs to show based on permissions
available_tabs = []
tab_permissions = {
    "🔍 Audit Explorer": "view_audit",
    "👥 Reviewer Queues": "manage_reviews", 
    "🛠️ Config Editor": "edit_config",
    "📄 Export & Logs": "export_data",
    "👥 User Management": "manage_users"
}

for tab_name, permission in tab_permissions.items():
    if check_permission(permission):
        available_tabs.append(tab_name)

if not available_tabs:
    st.error("🚫 You don't have permission to access any features. Please contact your administrator.")
    st.stop()

# Create tabs based on permissions
tabs = st.tabs(available_tabs)
tab_index = 0


# Sidebar for navigation and metrics
with st.sidebar:
    st.header("📊 Quick Metrics")
    
    try:
        df = get_review_data()
        if not df.empty:
            pending_count = len(df[df['status'] == 'pending'])
            approved_count = len(df[df['status'] == 'approved'])
            rejected_count = len(df[df['status'] == 'rejected'])
            
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Pending", pending_count)
            with col2:
                st.metric("Approved", approved_count)
            with col3:
                st.metric("Rejected", rejected_count)
        else:
            st.info("No review data available")
    except Exception as e:
        st.error(f"Error loading metrics: {e}")
    
    st.markdown("---")
    st.markdown("**Current User**")
    st.write(f"👤 {current_user.get('name', 'User')}")
    st.write(f"🏷️ {current_user.get('role', 'user').title()}")
    
    st.markdown("---")
    st.markdown("**Session Info**")
    st.caption(f"Last Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

# Determine which tabs to show based on permissions
available_tabs = []
tab_permissions = {
    "🔍 Audit Explorer": "view_audit",
    "👥 Reviewer Queues": "manage_reviews", 
    "🛠️ Config Editor": "edit_config",
    "📄 Export & Logs": "export_data",
    "👥 User Management": "manage_users"
}

for tab_name, permission in tab_permissions.items():
    if check_permission(permission):
        available_tabs.append(tab_name)

if not available_tabs:
    st.error("🚫 You don't have permission to access any features. Please contact your administrator.")
    st.stop()

# Create tabs based on permissions
tabs = st.tabs(available_tabs)
tab_index = 0

# Tab 1: Audit Explorer (view_audit permission)
if "🔍 Audit Explorer" in available_tabs:
    with tabs[tab_index]:
        st.subheader("🔍 Audit Explorer")
        
        try:
            df = get_review_data()
            
            if df.empty:
                st.info("No audit data available. Run `python cli.py` to generate review items.")
            else:
                # Filters
                col1, col2, col3, col4 = st.columns(4)
                
                with col1:
                    status_filter = st.selectbox(
                        "Status Filter", 
                        ["All"] + list(df['status'].unique())
                    )
                
                with col2:
                    app_filter = st.selectbox(
                        "App Filter", 
                        ["All"] + list(df['app'].unique())
                    )
                
                with col3:
                    group_filter = st.selectbox(
                        "Group Filter", 
                        ["All"] + list(df['group_name'].unique())
                    )
                
                with col4:
                    date_filter = st.date_input(
                        "From Date",
                        value=datetime.now() - timedelta(days=30)
                    )
                
                # Apply filters
                filtered_df = df.copy()
                
                if status_filter != "All":
                    filtered_df = filtered_df[filtered_df['status'] == status_filter]
                
                if app_filter != "All":
                    filtered_df = filtered_df[filtered_df['app'] == app_filter]
                
                if group_filter != "All":
                    filtered_df = filtered_df[filtered_df['group_name'] == group_filter]
                
                # Fix datetime parsing - handle multiple formats
                def parse_timestamp(ts_str):
                    if pd.isna(ts_str):
                        return pd.NaT
                    try:
                        # Try ISO format first
                        return pd.to_datetime(ts_str, format='ISO8601')
                    except:
                        try:
                            # Try common datetime format
                            return pd.to_datetime(ts_str, format='%Y-%m-%d %H:%M:%S')
                        except:
                            try:
                                # Fallback to automatic parsing
                                return pd.to_datetime(ts_str)
                            except:
                                return pd.NaT
                
                filtered_df['timestamp'] = filtered_df['timestamp'].apply(parse_timestamp)
                filtered_df = filtered_df[filtered_df['timestamp'] >= pd.Timestamp(date_filter)]
                
                # Display results
                st.write(f"**{len(filtered_df)} items found**")
                
                if not filtered_df.empty:
                    # Format display dataframe
                    display_df = filtered_df.copy()
                    display_df['Status'] = display_df['status'].apply(
                        lambda x: f"🔴 {x.title()}" if x == 'pending' 
                        else f"🟢 {x.title()}" if x == 'approved' 
                        else f"🟡 {x.title()}"
                    )
                    
                    # Show table
                    st.dataframe(
                        display_df[['timestamp', 'user_email', 'app', 'group_name', 'reasons', 'Status']],
                        column_config={
                            "timestamp": "Date",
                            "user_email": "User Email",
                            "app": "Application",
                            "group_name": "Group",
                            "reasons": "Flagged Reasons",
                            "Status": st.column_config.TextColumn("Status")
                        },
                        use_container_width=True
                    )
                    
                    # Risk analysis
                    st.subheader("📈 Risk Analysis")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Top apps by risk
                        app_risk = filtered_df.groupby('app').size().sort_values(ascending=False).head(5)
                        st.write("**Top Apps by Review Count**")
                        for app, count in app_risk.items():
                            st.write(f"• {app}: {count} items")
                    
                    with col2:
                        # Risk reasons breakdown
                        all_reasons = []
                        for reasons in filtered_df['reasons'].dropna():
                            all_reasons.extend([r.strip() for r in reasons.split(';')])
                        
                        reason_counts = pd.Series(all_reasons).value_counts().head(5)
                        st.write("**Top Risk Reasons**")
                        for reason, count in reason_counts.items():
                            st.write(f"• {reason}: {count} occurrences")
        
        except Exception as e:
            st.error(f"Error loading audit data: {e}")
    
    tab_index += 1

# Tab 2: Reviewer Queues (manage_reviews permission)
if "👥 Reviewer Queues" in available_tabs:
    with tabs[tab_index]:
        st.subheader("👥 Reviewer Queues")
        
        # Reviewer selection
        reviewers_config = get_reviewer_assignments()
        all_reviewers = set()
        
        for category in reviewers_config.values():
            if isinstance(category, dict):
                all_reviewers.update(category.values())
        
        # Auto-select current user if they're a reviewer
        current_user_email = current_user.get('email', '')
        default_reviewer = current_user_email if current_user_email in all_reviewers else ""
        
        if all_reviewers:
            selected_reviewer = st.selectbox(
                "Select Reviewer Email",
                [""] + sorted(list(all_reviewers)),
                index=list([""] + sorted(list(all_reviewers))).index(default_reviewer) if default_reviewer else 0
            )
            
            if selected_reviewer:
                try:
                    df = get_review_data()
                    
                    # Find items assigned to this reviewer
                    reviewer_items = []
                    
                    # Ensure we have the required columns
                    expected_columns = ['id', 'user_email', 'app', 'group_name', 'last_login', 'reasons', 'status']
                    available_columns = df.columns.tolist()
                    
                    # Add missing columns with default values if needed
                    for col in expected_columns:
                        if col not in available_columns:
                            df[col] = None
                    
                    for _, row in df.iterrows():
                        # Check if this reviewer is responsible
                        is_responsible = False
                        
                        # Check by app
                        if 'apps' in reviewers_config and row['app'] in reviewers_config['apps']:
                            if reviewers_config['apps'][row['app']] == selected_reviewer:
                                is_responsible = True
                        
                        # Check by group
                        if 'groups' in reviewers_config and row['group_name'] in reviewers_config['groups']:
                            if reviewers_config['groups'][row['group_name']] == selected_reviewer:
                                is_responsible = True
                        
                        # Check by user
                        if 'users' in reviewers_config and row['user_email'] in reviewers_config['users']:
                            if reviewers_config['users'][row['user_email']] == selected_reviewer:
                                is_responsible = True
                        
                        if is_responsible:
                            reviewer_items.append(row)
                    
                    if reviewer_items:
                        st.write(f"**{len(reviewer_items)} items assigned to {selected_reviewer}**")
                        
                        # Show pending items for review
                        pending_items = [item for item in reviewer_items if item['status'] == 'pending']
                        
                        if pending_items:
                            st.write("### 🔴 Pending Reviews")
                            
                            for item in pending_items:
                                with st.expander(f"Review: {item['user_email']} - {item['app']}"):
                                    col1, col2 = st.columns([2, 1])
                                    
                                    with col1:
                                        st.write(f"**User:** {item['user_email']}")
                                        st.write(f"**Application:** {item['app']}")
                                        st.write(f"**Group:** {item['group_name']}")
                                        st.write(f"**Last Login:** {item['last_login']}")
                                        st.write(f"**Reasons:** {item['reasons']}")
                                    
                                    with col2:
                                        st.write("**Take Action:**")
                                        
                                        comments = st.text_area(
                                            "Comments (optional)",
                                            key=f"comments_{item['id']}"
                                        )
                                        
                                        col_approve, col_reject = st.columns(2)
                                        
                                        with col_approve:
                                            if st.button("✅ Approve", key=f"approve_{item['id']}"):
                                                update_review_status(
                                                    item['id'], 
                                                    'approved', 
                                                    selected_reviewer, 
                                                    comments
                                                )
                                                generate_audit_log("review_approved", f"Approved review for {item['user_email']} - {item['app']}")
                                                st.success("Approved!")
                                                st.rerun()
                                        
                                        with col_reject:
                                            if st.button("❌ Reject", key=f"reject_{item['id']}"):
                                                update_review_status(
                                                    item['id'], 
                                                    'rejected', 
                                                    selected_reviewer, 
                                                    comments
                                                )
                                                generate_audit_log("review_rejected", f"Rejected review for {item['user_email']} - {item['app']}")
                                                st.success("Rejected!")
                                                st.rerun()
                        
                        # Show completed reviews
                        completed_items = [item for item in reviewer_items if item['status'] != 'pending']
                        
                        if completed_items:
                            st.write("### ✅ Completed Reviews")
                            
                            completed_df = pd.DataFrame(completed_items)
                            # Only show columns that exist
                            display_columns = ['timestamp', 'user_email', 'app', 'status']
                            if 'reviewer_comments' in completed_df.columns:
                                display_columns.append('reviewer_comments')
                            
                            available_display_columns = [col for col in display_columns if col in completed_df.columns]
                            
                            st.dataframe(
                                completed_df[available_display_columns],
                                use_container_width=True
                            )
                    
                    else:
                        st.info(f"No items assigned to {selected_reviewer}")
                
                except Exception as e:
                    st.error(f"Error loading reviewer queue: {e}")
        else:
            st.warning("No reviewers configured. Please add reviewers in the Config Editor.")
    
    tab_index += 1

# Tab 3: Config Editor (edit_config permission)
if "🛠️ Config Editor" in available_tabs:
    with tabs[tab_index]:
        st.subheader("🛠️ Configuration Editor")
        
        config_tabs = st.tabs(["🔧 Global Config", "👥 Reviewer Assignments", "🔍 Overrides"])
        
        # Tab 1: Global Configuration
        with config_tabs[0]:
            st.markdown("#### 🔧 Global Configuration")
            st.caption("Configure MCP rules, thresholds, and system settings")
            
            # Load current config
            config_data = load_yaml_safe(CONFIG_PATH)
            mcp_config = config_data.get('mcp', {})
            
            with st.form("global_config_form"):
                st.subheader("📋 Basic Settings")
                
                col1, col2 = st.columns(2)
                
                with col1:
                    ttl_days = st.number_input(
                        "TTL Days",
                        min_value=1,
                        max_value=365,
                        value=mcp_config.get('ttl_days', 90),
                        help="Time to live for access reviews in days"
                    )
                    
                    inactivity_days = st.number_input(
                        "Inactivity Threshold (Days)",
                        min_value=1,
                        max_value=180,
                        value=mcp_config.get('review_thresholds', {}).get('inactivity_days', 45),
                        help="Flag users inactive for this many days"
                    )
                
                with col2:
                    backup_cadence = st.selectbox(
                        "Backup Frequency",
                        ["daily", "weekly", "monthly", "6months", "annual"],
                        index=["daily", "weekly", "monthly", "6months", "annual"].index(
                            mcp_config.get('backup_cadence', 'monthly')
                        ),
                        help="How often to backup configuration files"
                    )
                    
                    orphaned_account_check = st.checkbox(
                        "Enable Orphaned Account Detection",
                        value=mcp_config.get('review_thresholds', {}).get('orphaned_account', True),
                        help="Flag potentially orphaned accounts"
                    )
                
                st.subheader("👥 Group Settings")
                
                # Ignore Groups
                ignore_groups = mcp_config.get('ignore_groups', [])
                ignore_groups_text = st.text_area(
                    "Ignore Groups (one per line)",
                    value="\n".join(ignore_groups),
                    height=100,
                    help="Groups to exclude from access reviews"
                )
                
                # Risky Roles
                risky_roles = mcp_config.get('risky_roles', [])
                risky_roles_text = st.text_area(
                    "Risky Roles (one per line)",
                    value="\n".join(risky_roles),
                    height=100,
                    help="Roles that require additional scrutiny"
                )
                
                st.subheader("📱 Application Settings")
                
                # Ignore Apps
                ignore_apps = mcp_config.get('ignore_apps', [])
                ignore_apps_text = st.text_area(
                    "Ignore Applications (one per line)",
                    value="\n".join(ignore_apps),
                    height=150,
                    help="Applications to exclude from access reviews"
                )
                
                st.subheader("📨 Notification Settings")
                
                col1, col2, col3 = st.columns(3)
                
                with col1:
                    notify_method = st.selectbox(
                        "Notification Method",
                        ["slack", "email", "teams"],
                        index=["slack", "email", "teams"].index(
                            mcp_config.get('notify', {}).get('method', 'slack')
                        )
                    )
                
                with col2:
                    retry_limit = st.number_input(
                        "Retry Limit",
                        min_value=1,
                        max_value=10,
                        value=mcp_config.get('notify', {}).get('retry_limit', 3),
                        help="Number of notification retry attempts"
                    )
                
                with col3:
                    escalate_days = st.number_input(
                        "Escalate After (Days)",
                        min_value=1,
                        max_value=30,
                        value=mcp_config.get('notify', {}).get('escalate_after_days', 5),
                        help="Days before escalating unresolved reviews"
                    )
                
                # Save button
                if st.form_submit_button("💾 Save Global Configuration", type="primary"):
                    # Process text areas
                    processed_ignore_groups = [g.strip() for g in ignore_groups_text.split('\n') if g.strip()]
                    processed_risky_roles = [r.strip() for r in risky_roles_text.split('\n') if r.strip()]
                    processed_ignore_apps = [a.strip() for a in ignore_apps_text.split('\n') if a.strip()]
                    
                    # Build new config
                    new_config = {
                        'mcp': {
                            'ttl_days': ttl_days,
                            'ignore_groups': processed_ignore_groups,
                            'risky_roles': processed_risky_roles,
                            'ignore_apps': processed_ignore_apps,
                            'review_thresholds': {
                                'inactivity_days': inactivity_days,
                                'orphaned_account': orphaned_account_check
                            },
                            'backup_cadence': backup_cadence,
                            'notify': {
                                'method': notify_method,
                                'retry_limit': retry_limit,
                                'escalate_after_days': escalate_days
                            }
                        }
                    }
                    
                    # Save configuration
                    if save_yaml_safe(CONFIG_PATH, new_config):
                        generate_audit_log("config_updated", "Updated global configuration")
                        st.success("✅ Global configuration saved successfully!")
                        st.rerun()
                    else:
                        st.error("❌ Failed to save configuration")
        
        # Tab 2: Reviewer Assignments
        with config_tabs[1]:
            st.markdown("#### 👥 Reviewer Assignments")
            st.caption("Configure who reviews access for specific apps, groups, and users")
            
            # Load current reviewers config
            reviewers_data = load_yaml_safe(REVIEWERS_PATH)
            reviewers_config = reviewers_data.get('reviewers', {})
            
            reviewer_tabs = st.tabs(["📱 App Reviewers", "👥 Group Reviewers", "👤 User Reviewers"])
            
            # App Reviewers
            with reviewer_tabs[0]:
                st.write("### Application Reviewers")
                st.caption("Assign reviewers for specific applications")
                
                apps_config = reviewers_config.get('apps', {})
                
                with st.form("app_reviewers_form"):
                    st.write("**Current App Assignments:**")
                    
                    # Show existing assignments with edit capability
                    updated_apps = {}
                    for i, (app, reviewer) in enumerate(apps_config.items()):
                        col1, col2, col3 = st.columns([2, 2, 1])
                        with col1:
                            app_name = st.text_input(f"App {i+1}", value=app, key=f"app_name_{i}")
                        with col2:
                            reviewer_email = st.text_input(f"Reviewer {i+1}", value=reviewer, key=f"app_reviewer_{i}")
                        with col3:
                            if st.checkbox("Delete", key=f"delete_app_{i}"):
                                continue  # Skip this entry
                        
                        if app_name and reviewer_email:
                            updated_apps[app_name] = reviewer_email
                    
                    # Add new assignment
                    st.write("**Add New App Assignment:**")
                    col1, col2 = st.columns(2)
                    with col1:
                        new_app = st.text_input("New App Name")
                    with col2:
                        new_app_reviewer = st.text_input("Reviewer Email")
                    
                    if new_app and new_app_reviewer:
                        updated_apps[new_app] = new_app_reviewer
                    
                    if st.form_submit_button("💾 Save App Reviewers"):
                        new_reviewers_config = reviewers_config.copy()
                        new_reviewers_config['apps'] = updated_apps
                        
                        new_reviewers_data = {'reviewers': new_reviewers_config}
                        
                        if save_yaml_safe(REVIEWERS_PATH, new_reviewers_data):
                            generate_audit_log("reviewers_updated", "Updated app reviewer assignments")
                            st.success("✅ App reviewers saved successfully!")
                            st.rerun()
                        else:
                            st.error("❌ Failed to save app reviewers")
            
            # Group Reviewers  
            with reviewer_tabs[1]:
                st.write("### Group Reviewers")
                st.caption("Assign reviewers for specific groups")
                
                groups_config = reviewers_config.get('groups', {})
                
                with st.form("group_reviewers_form"):
                    st.write("**Current Group Assignments:**")
                    
                    updated_groups = {}
                    for i, (group, reviewer) in enumerate(groups_config.items()):
                        col1, col2, col3 = st.columns([2, 2, 1])
                        with col1:
                            group_name = st.text_input(f"Group {i+1}", value=group, key=f"group_name_{i}")
                        with col2:
                            reviewer_email = st.text_input(f"Reviewer {i+1}", value=reviewer, key=f"group_reviewer_{i}")
                        with col3:
                            if st.checkbox("Delete", key=f"delete_group_{i}"):
                                continue
                        
                        if group_name and reviewer_email:
                            updated_groups[group_name] = reviewer_email
                    
                    # Add new assignment
                    st.write("**Add New Group Assignment:**")
                    col1, col2 = st.columns(2)
                    with col1:
                        new_group = st.text_input("New Group Name")
                    with col2:
                        new_group_reviewer = st.text_input("Reviewer Email")
                    
                    if new_group and new_group_reviewer:
                        updated_groups[new_group] = new_group_reviewer
                    
                    if st.form_submit_button("💾 Save Group Reviewers"):
                        new_reviewers_config = reviewers_config.copy()
                        new_reviewers_config['groups'] = updated_groups
                        
                        new_reviewers_data = {'reviewers': new_reviewers_config}
                        
                        if save_yaml_safe(REVIEWERS_PATH, new_reviewers_data):
                            generate_audit_log("reviewers_updated", "Updated group reviewer assignments")
                            st.success("✅ Group reviewers saved successfully!")
                            st.rerun()
                        else:
                            st.error("❌ Failed to save group reviewers")
            
            # User Reviewers
            with reviewer_tabs[2]:
                st.write("### User Reviewers")
                st.caption("Assign reviewers for specific users (VIPs, executives, etc.)")
                
                users_config = reviewers_config.get('users', {})
                
                with st.form("user_reviewers_form"):
                    st.write("**Current User Assignments:**")
                    
                    updated_users = {}
                    for i, (user, reviewer) in enumerate(users_config.items()):
                        col1, col2, col3 = st.columns([2, 2, 1])
                        with col1:
                            user_email = st.text_input(f"User {i+1}", value=user, key=f"user_name_{i}")
                        with col2:
                            reviewer_email = st.text_input(f"Reviewer {i+1}", value=reviewer, key=f"user_reviewer_{i}")
                        with col3:
                            if st.checkbox("Delete", key=f"delete_user_{i}"):
                                continue
                        
                        if user_email and reviewer_email:
                            updated_users[user_email] = reviewer_email
                    
                    # Add new assignment
                    st.write("**Add New User Assignment:**")
                    col1, col2 = st.columns(2)
                    with col1:
                        new_user = st.text_input("User Email")
                    with col2:
                        new_user_reviewer = st.text_input("Reviewer Email")
                    
                    if new_user and new_user_reviewer:
                        updated_users[new_user] = new_user_reviewer
                    
                    if st.form_submit_button("💾 Save User Reviewers"):
                        new_reviewers_config = reviewers_config.copy()
                        new_reviewers_config['users'] = updated_users
                        
                        new_reviewers_data = {'reviewers': new_reviewers_config}
                        
                        if save_yaml_safe(REVIEWERS_PATH, new_reviewers_data):
                            generate_audit_log("reviewers_updated", "Updated user reviewer assignments")
                            st.success("✅ User reviewers saved successfully!")
                            st.rerun()
                        else:
                            st.error("❌ Failed to save user reviewers")
        
        # Tab 3: Overrides
        with config_tabs[2]:
            st.markdown("#### 🔍 Review Overrides")
            st.caption("Configure special rules and exceptions")
            
            # Load overrides
            overrides_data = load_yaml_safe(OVERRIDES_PATH)
            
            st.info("🚧 Override configuration coming soon. This will allow you to set exceptions for specific users or scenarios.")
            
            # Placeholder for overrides configuration
            with st.form("overrides_form"):
                st.text_area(
                    "Override Rules (YAML format)",
                    value=yaml.dump(overrides_data, default_flow_style=False) if overrides_data else "# Override rules go here\n",
                    height=200,
                    help="Configure special exceptions in YAML format"
                )
                
                if st.form_submit_button("💾 Save Overrides"):
                    st.info("Override saving functionality will be implemented in the next update.")
    
    tab_index += 1

# Tab 4: Export & Logs (export_data permission)
if "📄 Export & Logs" in available_tabs:
    with tabs[tab_index]:
        st.subheader("📄 Export & Logs")
        
        # Export section
        st.write("### 📤 Export Data")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.write("**Export Reviews**")
            
            export_format = st.selectbox("Format", ["CSV", "JSON", "Excel"])
            include_all = st.checkbox("Include all historical data", value=False)
            
            if st.button("📥 Generate Export"):
                try:
                    df = get_review_data()
                    
                    if not include_all:
                        # Only last 30 days
                        cutoff_date = datetime.now() - timedelta(days=30)
                        df['timestamp'] = pd.to_datetime(df['timestamp'])
                        df = df[df['timestamp'] >= cutoff_date]
                    
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    
                    if export_format == "CSV":
                        filename = f"bouncr_export_{timestamp}.csv"
                        filepath = EXPORTS_DIR / filename
                        df.to_csv(filepath, index=False)
                        
                    elif export_format == "JSON":
                        filename = f"bouncr_export_{timestamp}.json"
                        filepath = EXPORTS_DIR / filename
                        df.to_json(filepath, orient='records', date_format='iso')
                        
                    elif export_format == "Excel":
                        filename = f"bouncr_export_{timestamp}.xlsx"
                        filepath = EXPORTS_DIR / filename
                        df.to_excel(filepath, index=False, sheet_name='Reviews')
                    
                    generate_audit_log("data_exported", f"Exported {len(df)} records as {export_format}")
                    st.success(f"Export saved: {filename}")
                    st.download_button(
                        label=f"📥 Download {filename}",
                        data=filepath.read_bytes(),
                        file_name=filename,
                        mime="application/octet-stream"
                    )
                    
                except Exception as e:
                    st.error(f"Export failed: {e}")
        
        with col2:
            st.write("**Export Configuration**")
            
            if st.button("📄 Generate Config Report"):
                try:
                    from utils.reporting import generate_human_readable_report
                    
                    report_content = generate_human_readable_report(
                        CONFIG_PATH, REVIEWERS_PATH, OVERRIDES_PATH
                    )
                    
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"bouncr_config_report_{timestamp}.md"
                    
                    st.download_button(
                        label="📥 Download Config Report",
                        data=report_content,
                        file_name=filename,
                        mime="text/markdown"
                    )
                    
                    generate_audit_log("config_exported", "Generated configuration report")
                    st.success("Config report generated!")
                    
                except Exception as e:
                    st.error(f"Report generation failed: {e}")
        
        st.markdown("---")
        
        # Logs section
        st.write("### 📋 System Logs")
        
        try:
            log_files = list(LOGS_DIR.glob("*.jsonl"))
            
            if log_files:
                selected_log = st.selectbox(
                    "Select Log File",
                    [f.name for f in sorted(log_files, reverse=True)]
                )
                
                if selected_log:
                    log_path = LOGS_DIR / selected_log
                    
                    # Show log preview
                    with open(log_path, 'r') as f:
                        lines = f.readlines()
                    
                    st.write(f"**{selected_log}** ({len(lines)} entries)")
                    
                    # Show recent entries
                    recent_lines = lines[-10:] if len(lines) > 10 else lines
                    
                    for line in recent_lines:
                        try:
                            entry = json.loads(line.strip())
                            timestamp = entry.get('timestamp', 'Unknown')
                            action = entry.get('action', 'Unknown')
                            user = entry.get('user', 'Unknown')
                            st.write(f"• `{timestamp}` - **{user}**: {action}")
                        except:
                            st.write(f"• {line.strip()}")
                    
                    # Download log
                    st.download_button(
                        label=f"📥 Download {selected_log}",
                        data=log_path.read_text(),
                        file_name=selected_log,
                        mime="application/json"
                    )
            else:
                st.info("No log files found")
        
        except Exception as e:
            st.error(f"Error reading logs: {e}")
        
        st.markdown("---")
        
        # Backup management
        st.write("### 💾 Backup Management")
        
        try:
            backup_dirs = [d for d in BACKUP_DIR.iterdir() if d.is_dir()]
            
            if backup_dirs:
                for backup_type in backup_dirs:
                    backup_files = list(backup_type.glob("*.yaml"))
                    if backup_files:
                        st.write(f"**{backup_type.name.title()} Backups:** {len(backup_files)} files")
                        
                        # Show latest backup
                        latest_backup = max(backup_files, key=lambda x: x.stat().st_mtime)
                        backup_time = datetime.fromtimestamp(latest_backup.stat().st_mtime)
                        st.caption(f"Latest: {latest_backup.name} ({backup_time.strftime('%Y-%m-%d %H:%M:%S')})")
            else:
                st.info("No backups found")
        
        except Exception as e:
            st.error(f"Error reading backups: {e}")
    
    tab_index += 1

# Tab 5: User Management (manage_users permission)
if "👥 User Management" in available_tabs:
    with tabs[tab_index]:
        show_user_management(auth)

# Auto-backup functionality (same as before)
def should_backup(cadence: str, last_backup_time: datetime) -> bool:
    now = datetime.now()
    delta = {
        "daily": timedelta(days=1),
        "weekly": timedelta(weeks=1),
        "monthly": timedelta(days=30),
        "6months": timedelta(days=182),
        "annual": timedelta(days=365)
    }.get(cadence.lower(), timedelta(days=30))
    return now - last_backup_time >= delta

def get_last_backup_time(file_label: str) -> datetime:
    backup_path = BACKUP_DIR / file_label
    if not backup_path.exists():
        return datetime.min
    timestamps = []
    for p in backup_path.glob("*.yaml"):
        try:
            timestamps.append(datetime.strptime(p.stem, "%Y%m%d-%H%M%S"))
        except ValueError:
            continue
    return max(timestamps) if timestamps else datetime.min

def backup_config_files():
    try:
        config_data = load_yaml_safe(CONFIG_PATH)
        cadence = config_data.get("mcp", {}).get("backup_cadence", "monthly")
    except Exception:
        cadence = "monthly"

    for label, path in CONFIG_FILES.items():
        if not path.exists():
            continue
        last_backup = get_last_backup_time(label)
        if should_backup(cadence, last_backup):
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup_path = BACKUP_DIR / label
            backup_path.mkdir(parents=True, exist_ok=True)
            shutil.copy(path, backup_path / f"{timestamp}.yaml")

# Run auto-backup
backup_config_files()