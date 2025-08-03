# labs/bouncr/auth.py

import streamlit as st
import hashlib
import hmac
import yaml
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional, List
import secrets

AUTH_CONFIG_PATH = Path("labs/bouncr/auth_config.yaml")
SESSIONS_PATH = Path("labs/bouncr/sessions.json")

class BouncerAuth:
    def __init__(self):
        self.auth_config = self.load_auth_config()
        self.sessions = self.load_sessions()
        
    def load_auth_config(self) -> Dict:
        """Load authentication configuration"""
        if not AUTH_CONFIG_PATH.exists():
            # Create default auth config
            default_config = {
                "users": {
                    "admin": {
                        "password_hash": self.hash_password("admin123"),
                        "role": "admin",
                        "name": "Administrator",
                        "email": "admin@company.com",
                        "permissions": ["all"]
                    }
                },
                "roles": {
                    "admin": {
                        "permissions": [
                            "view_audit",
                            "manage_reviews", 
                            "edit_config",
                            "export_data",
                            "manage_users"
                        ]
                    },
                    "reviewer": {
                        "permissions": [
                            "view_audit",
                            "manage_reviews"
                        ]
                    },
                    "viewer": {
                        "permissions": [
                            "view_audit"
                        ]
                    }
                },
                "session_timeout_hours": 8,
                "max_login_attempts": 5,
                "lockout_duration_minutes": 30
            }
            
            AUTH_CONFIG_PATH.parent.mkdir(exist_ok=True)
            with open(AUTH_CONFIG_PATH, 'w') as f:
                yaml.dump(default_config, f, default_flow_style=False)
            
            return default_config
        
        with open(AUTH_CONFIG_PATH, 'r') as f:
            return yaml.safe_load(f)
    
    def save_auth_config(self):
        """Save authentication configuration"""
        with open(AUTH_CONFIG_PATH, 'w') as f:
            yaml.dump(self.auth_config, f, default_flow_style=False)
    
    def load_sessions(self) -> Dict:
        """Load active sessions"""
        if not SESSIONS_PATH.exists():
            return {}
        
        try:
            with open(SESSIONS_PATH, 'r') as f:
                sessions = json.load(f)
            
            # Clean expired sessions
            current_time = datetime.now()
            valid_sessions = {}
            
            for session_id, session_data in sessions.items():
                expires_at = datetime.fromisoformat(session_data['expires_at'])
                if expires_at > current_time:
                    valid_sessions[session_id] = session_data
            
            # Save cleaned sessions
            self.save_sessions(valid_sessions)
            return valid_sessions
        
        except Exception:
            return {}
    
    def save_sessions(self, sessions: Dict = None):
        """Save sessions to file"""
        if sessions is None:
            sessions = self.sessions
        
        SESSIONS_PATH.parent.mkdir(exist_ok=True)
        with open(SESSIONS_PATH, 'w') as f:
            json.dump(sessions, f, indent=2)
    
    def hash_password(self, password: str) -> str:
        """Hash a password using SHA-256"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def verify_password(self, password: str, password_hash: str) -> bool:
        """Verify a password against its hash"""
        return hmac.compare_digest(self.hash_password(password), password_hash)
    
    def authenticate(self, username: str, password: str) -> Optional[Dict]:
        """Authenticate user credentials"""
        user_data = self.auth_config.get("users", {}).get(username)
        
        if not user_data:
            return None
        
        # Check for account lockout
        lockout_key = f"lockout_{username}"
        if lockout_key in st.session_state:
            lockout_time = st.session_state[lockout_key]
            if datetime.now() < lockout_time:
                return None
        
        # Check login attempts
        attempts_key = f"attempts_{username}"
        attempts = st.session_state.get(attempts_key, 0)
        max_attempts = self.auth_config.get("max_login_attempts", 5)
        
        if attempts >= max_attempts:
            # Lock account
            lockout_duration = self.auth_config.get("lockout_duration_minutes", 30)
            st.session_state[lockout_key] = datetime.now() + timedelta(minutes=lockout_duration)
            return None
        
        # Verify password
        if self.verify_password(password, user_data["password_hash"]):
            # Reset login attempts on success
            if attempts_key in st.session_state:
                del st.session_state[attempts_key]
            
            return {
                "username": username,
                "role": user_data["role"],
                "name": user_data["name"],
                "email": user_data["email"],
                "permissions": self.get_user_permissions(user_data["role"])
            }
        else:
            # Increment failed attempts
            st.session_state[attempts_key] = attempts + 1
            return None
    
    def get_user_permissions(self, role: str) -> List[str]:
        """Get permissions for a user role"""
        role_data = self.auth_config.get("roles", {}).get(role, {})
        return role_data.get("permissions", [])
    
    def create_session(self, user_data: Dict) -> str:
        """Create a new user session"""
        session_id = secrets.token_urlsafe(32)
        timeout_hours = self.auth_config.get("session_timeout_hours", 8)
        expires_at = datetime.now() + timedelta(hours=timeout_hours)
        
        session_data = {
            "user": user_data,
            "created_at": datetime.now().isoformat(),
            "expires_at": expires_at.isoformat(),
            "last_activity": datetime.now().isoformat()
        }
        
        self.sessions[session_id] = session_data
        self.save_sessions()
        
        return session_id
    
    def validate_session(self, session_id: str) -> Optional[Dict]:
        """Validate and update session"""
        if not session_id or session_id not in self.sessions:
            return None
        
        session_data = self.sessions[session_id]
        expires_at = datetime.fromisoformat(session_data['expires_at'])
        
        if datetime.now() > expires_at:
            # Session expired
            del self.sessions[session_id]
            self.save_sessions()
            return None
        
        # Update last activity
        session_data['last_activity'] = datetime.now().isoformat()
        self.save_sessions()
        
        return session_data['user']
    
    def logout(self, session_id: str):
        """Logout user and destroy session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            self.save_sessions()
    
    def has_permission(self, user_permissions: List[str], required_permission: str) -> bool:
        """Check if user has required permission"""
        return "all" in user_permissions or required_permission in user_permissions
    
    def add_user(self, username: str, password: str, role: str, name: str, email: str) -> bool:
        """Add a new user"""
        if username in self.auth_config["users"]:
            return False
        
        self.auth_config["users"][username] = {
            "password_hash": self.hash_password(password),
            "role": role,
            "name": name,
            "email": email,
            "created_at": datetime.now().isoformat()
        }
        
        self.save_auth_config()
        return True
    
    def update_user(self, username: str, **kwargs) -> bool:
        """Update user information"""
        if username not in self.auth_config["users"]:
            return False
        
        user_data = self.auth_config["users"][username]
        
        for key, value in kwargs.items():
            if key == "password" and value:
                user_data["password_hash"] = self.hash_password(value)
            elif key in ["role", "name", "email"] and value:
                user_data[key] = value
        
        user_data["updated_at"] = datetime.now().isoformat()
        self.save_auth_config()
        return True
    
    def delete_user(self, username: str) -> bool:
        """Delete a user"""
        if username not in self.auth_config["users"]:
            return False
        
        del self.auth_config["users"][username]
        self.save_auth_config()
        return True

def require_auth(required_permission: str = None):
    """Decorator to require authentication for Streamlit pages"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            auth = BouncerAuth()
            
            # Check for existing session
            session_id = st.session_state.get("session_id")
            user = auth.validate_session(session_id) if session_id else None
            
            if not user:
                show_login_page(auth)
                return
            
            # Check permissions
            if required_permission and not auth.has_permission(user.get("permissions", []), required_permission):
                st.error("🚫 Access denied. You don't have permission to view this page.")
                st.stop()
            
            # Store user in session state for use in the app
            st.session_state["current_user"] = user
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

def show_login_page(auth: BouncerAuth):
    """Display login page"""
    st.set_page_config(page_title="Bouncr Login", page_icon="🔐")
    
    # Custom CSS for login page
    st.markdown("""
    <style>
        .login-container {
            max-width: 400px;
            margin: 0 auto;
            padding: 2rem;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .login-header {
            text-align: center;
            margin-bottom: 2rem;
        }
        .stButton > button {
            width: 100%;
            background: #ff6b6b;
            color: white;
            border: none;
            padding: 0.5rem;
            border-radius: 5px;
        }
    </style>
    """, unsafe_allow_html=True)
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        st.markdown("""
        <div class="login-container">
            <div class="login-header">
                <h1>🛡️ Bouncr</h1>
                <p>Access Review Dashboard</p>
            </div>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("### 🔐 Login")
        
        with st.form("login_form"):
            username = st.text_input("Username", placeholder="Enter your username")
            password = st.text_input("Password", type="password", placeholder="Enter your password")
            submit_button = st.form_submit_button("🚪 Login")
            
            if submit_button:
                if not username or not password:
                    st.error("Please enter both username and password")
                else:
                    user = auth.authenticate(username, password)
                    
                    if user:
                        # Create session
                        session_id = auth.create_session(user)
                        st.session_state["session_id"] = session_id
                        st.session_state["current_user"] = user
                        
                        st.success(f"Welcome back, {user['name']}!")
                        st.rerun()
                    else:
                        # Check if account is locked
                        lockout_key = f"lockout_{username}"
                        if lockout_key in st.session_state:
                            lockout_time = st.session_state[lockout_key]
                            if datetime.now() < lockout_time:
                                remaining = lockout_time - datetime.now()
                                st.error(f"🔒 Account locked. Try again in {remaining.seconds // 60} minutes.")
                            else:
                                del st.session_state[lockout_key]
                        else:
                            attempts_key = f"attempts_{username}"
                            attempts = st.session_state.get(attempts_key, 0)
                            max_attempts = auth.auth_config.get("max_login_attempts", 5)
                            remaining = max_attempts - attempts
                            
                            if remaining > 0:
                                st.error(f"❌ Invalid credentials. {remaining} attempts remaining.")
                            else:
                                st.error("🔒 Account locked due to too many failed attempts.")
        
        # Default credentials info
        with st.expander("ℹ️ Default Credentials"):
            st.info("""
            **Default Admin Account:**
            - Username: `admin`
            - Password: `admin123`
            
            ⚠️ Please change the default password after first login!
            """)

def show_user_management(auth: BouncerAuth):
    """User management interface for admins"""
    import pandas as pd  # Import pandas here to avoid global dependency
    
    st.subheader("👥 User Management")
    
    current_user = st.session_state.get("current_user", {})
    if not auth.has_permission(current_user.get("permissions", []), "manage_users"):
        st.error("🚫 You don't have permission to manage users.")
        return
    
    # Tabs for different user management functions
    user_tabs = st.tabs(["👀 View Users", "➕ Add User", "✏️ Edit User"])
    
    with user_tabs[0]:
        st.write("### Current Users")
        users_data = []
        
        for username, user_info in auth.auth_config.get("users", {}).items():
            users_data.append({
                "Username": username,
                "Name": user_info.get("name", ""),
                "Email": user_info.get("email", ""),
                "Role": user_info.get("role", ""),
                "Created": user_info.get("created_at", "Unknown")[:10] if user_info.get("created_at") else "Unknown"
            })
        
        if users_data:
            df = pd.DataFrame(users_data)
            st.dataframe(df, use_container_width=True)
        else:
            st.info("No users found")
    
    with user_tabs[1]:
        st.write("### Add New User")
        
        with st.form("add_user_form"):
            new_username = st.text_input("Username")
            new_name = st.text_input("Full Name")
            new_email = st.text_input("Email")
            new_password = st.text_input("Password", type="password")
            new_role = st.selectbox("Role", ["admin", "reviewer", "viewer"])
            
            if st.form_submit_button("➕ Add User"):
                if not all([new_username, new_name, new_email, new_password]):
                    st.error("All fields are required")
                elif auth.add_user(new_username, new_password, new_role, new_name, new_email):
                    st.success(f"User '{new_username}' added successfully!")
                    st.rerun()
                else:
                    st.error("Username already exists")
    
    with user_tabs[2]:
        st.write("### Edit User")
        
        users = list(auth.auth_config.get("users", {}).keys())
        if users:
            selected_user = st.selectbox("Select User to Edit", users)
            
            if selected_user:
                user_info = auth.auth_config["users"][selected_user]
                
                with st.form("edit_user_form"):
                    edit_name = st.text_input("Full Name", value=user_info.get("name", ""))
                    edit_email = st.text_input("Email", value=user_info.get("email", ""))
                    edit_role = st.selectbox("Role", ["admin", "reviewer", "viewer"], 
                                           index=["admin", "reviewer", "viewer"].index(user_info.get("role", "viewer")))
                    edit_password = st.text_input("New Password (leave blank to keep current)", type="password")
                    
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        if st.form_submit_button("💾 Update User"):
                            update_data = {"name": edit_name, "email": edit_email, "role": edit_role}
                            if edit_password:
                                update_data["password"] = edit_password
                            
                            if auth.update_user(selected_user, **update_data):
                                st.success(f"User '{selected_user}' updated successfully!")
                                st.rerun()
                            else:
                                st.error("Failed to update user")
                    
                    with col2:
                        if st.form_submit_button("🗑️ Delete User", type="secondary"):
                            if selected_user == current_user.get("username"):
                                st.error("You cannot delete your own account")
                            elif auth.delete_user(selected_user):
                                st.success(f"User '{selected_user}' deleted successfully!")
                                st.rerun()
                            else:
                                st.error("Failed to delete user")
        else:
            st.info("No users available to edit")

def logout_user():
    """Logout current user"""
    auth = BouncerAuth()
    session_id = st.session_state.get("session_id")
    
    if session_id:
        auth.logout(session_id)
    
    # Clear session state
    for key in list(st.session_state.keys()):
        del st.session_state[key]
    
    st.rerun()

def show_user_header():
    """Show current user info and logout button in header"""
    current_user = st.session_state.get("current_user")
    
    if current_user:
        col1, col2, col3 = st.columns([2, 1, 1])
        
        with col1:
            st.markdown(f"👋 Welcome, **{current_user.get('name', 'User')}** ({current_user.get('role', 'user').title()})")
        
        with col2:
            if st.button("👤 Profile"):
                st.session_state["show_profile"] = not st.session_state.get("show_profile", False)
        
        with col3:
            if st.button("🚪 Logout"):
                logout_user()
        
        # Show profile info if requested
        if st.session_state.get("show_profile", False):
            with st.expander("👤 Profile Information", expanded=True):
                st.write(f"**Username:** {current_user.get('username', 'N/A')}")
                st.write(f"**Email:** {current_user.get('email', 'N/A')}")
                st.write(f"**Role:** {current_user.get('role', 'N/A').title()}")
                st.write(f"**Permissions:** {', '.join(current_user.get('permissions', []))}")
        
        st.markdown("---")