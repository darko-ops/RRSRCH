# labs/bouncr/dashboard.py

import streamlit as st
import yaml
import shutil
from datetime import datetime, timedelta
from pathlib import Path



CONFIG_PATH = Path("labs/bouncr/config.yaml")
REVIEWERS_PATH = Path("labs/bouncr/reviewers.yaml")
OVERRIDES_PATH = Path("labs/bouncr/overrides.yaml")
BACKUP_DIR = Path("labs/bouncr/backups")
CONFIG_FILES = {
    "config": CONFIG_PATH,
    "reviewers": REVIEWERS_PATH,
    "overrides": OVERRIDES_PATH,
}

st.set_page_config(page_title="Bouncr Dashboard", layout="wide")
st.title("🛡️ Bouncr Dashboard")

tabs = st.tabs(["🔍 Audit Explorer", "👥 Reviewer Queues", "🛠️ Config Editor", "📄 Export & Logs"])

with tabs[0]:
    st.subheader("Audit Explorer")
    st.info("View and filter audit results here. [Coming soon]")

with tabs[1]:
    st.subheader("Reviewer Queues")
    st.info("Review access items assigned to you. [Coming soon]")

with tabs[2]:
    st.subheader("🛠️ Config Editor")

    def edit_yaml(label, path: Path):
        st.markdown(f"#### {label}")
        if not path.exists():
            st.warning(f"{path.name} not found.")
            return

        content = path.read_text()
        modified_time = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        st.caption(f"Last modified: {modified_time}")

        edited = st.text_area(f"Edit {path.name}", content, height=300, key=path.name)

        if edited != content:
            try:
                yaml.safe_load(edited)
                path.write_text(edited)
                st.success(f"{path.name} auto-saved.", icon="✅")
                st.experimental_rerun()
            except yaml.YAMLError as e:
                st.error(f"YAML Error: {e}")

    edit_yaml("🔧 Global Config", CONFIG_PATH)
    st.divider()
    edit_yaml("👥 Reviewers Mapping", REVIEWERS_PATH)
    st.divider()
    edit_yaml("🔍 Overrides", OVERRIDES_PATH)

with tabs[3]:
    st.subheader("Exports & Logs")
    st.info("Export CSV, view logs, download audit history. [Coming soon]")

if st.button("📝 Generate Config Report as PDF"):
    try:
        generate_human_readable_pdf(CONFIG_PATH, REVIEWERS_PATH, OVERRIDES_PATH)
        st.success("PDF report generated!")
    except Exception as e:
        st.error(f"PDF generation failed: {e}")



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
    timestamps = [datetime.strptime(p.stem, "%Y%m%d-%H%M%S") for p in backup_path.glob("*.yaml")]
    return max(timestamps) if timestamps else datetime.min

def backup_config_files():
    try:
        config_data = yaml.safe_load(CONFIG_PATH.read_text())
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

backup_config_files()