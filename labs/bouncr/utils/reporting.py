# labs/bouncr/utils/reporting.py

from pathlib import Path
import yaml
from datetime import datetime

def generate_human_readable_report(config_path: Path, reviewers_path: Path, overrides_path: Path) -> str:
    def load_yaml(path):
        try:
            return yaml.safe_load(path.read_text())
        except Exception:
            return {}

    config = load_yaml(config_path)
    reviewers = load_yaml(reviewers_path)
    overrides = load_yaml(overrides_path)

    lines = ["# Bouncr Configuration Report\n"]
    lines.append(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    lines.append("\n## 🔧 Global Configuration\n")
    for section, values in config.items():
        lines.append(f"### {section}")
        if isinstance(values, dict):
            for k, v in values.items():
                lines.append(f"- **{k}**: {v}")
        else:
            lines.append(f"- {values}")

    lines.append("\n## 👥 Reviewer Assignments\n")
    for group, reviewer in reviewers.items():
        lines.append(f"- **{group}** → {reviewer}")

    lines.append("\n## 🚫 User Overrides\n")
    for user, rules in overrides.items():
        lines.append(f"- **{user}**")
        if isinstance(rules, dict):
            for rule, val in rules.items():
                lines.append(f"    - {rule}: {val}")

    return "\n".join(lines)
