# labs/bouncr/models/access_item.py

from dataclasses import dataclass
from datetime import datetime

@dataclass
class AccessItem:
    user_id: str
    user_email: str
    group: str
    app: str
    last_login: datetime
    is_privileged: bool
