import yaml
from pathlib import Path

REVIEWER_CONFIG = Path(__file__).resolve().parent / "reviewers.yaml"

def get_reviewer_for(item):
    with open(REVIEWER_CONFIG, "r") as f:
        data = yaml.safe_load(f)["reviewers"]

    # Priority: user -> group -> app -> default
    return (
        data["users"].get(item.user_email)
        or data["groups"].get(item.group)
        or data["apps"].get(item.app)
        or None
    )
