# labs/bouncr/notifier.py
import os
import smtplib
import unicodedata
from email.message import EmailMessage
from typing import List, Tuple
from models.access_item import AccessItem
from reviewer_mapper import get_reviewer_for


def format_email(item: AccessItem, reasons: List[str]) -> str:
    reason_list = "\n".join([f"- {r}" for r in reasons])
    return (
        f"Access Review Required\n\n"
        f"User: {item.user_email}\n"
        f"App: {item.app}\n"
        f"Group: {item.group}\n"
        f"Last Login: {item.last_login.strftime('%Y-%m-%d')}\n"
        f"Reasons:\n{reason_list}\n"
    )


def clean_text(text: str) -> str:
    """Removes non-breaking spaces, normalizes unicode, strips non-ASCII."""
    text = text.replace('\u00a0', ' ')
    text = unicodedata.normalize("NFKD", text)
    return text.encode("ascii", "ignore").decode("ascii")


def send_email(subject: str, body: str, to_email: str):
    msg = EmailMessage()
    msg.set_content(clean_text(body))
    msg["Subject"] = clean_text(subject)
    msg["From"] = clean_text(os.getenv("EMAIL_USERNAME") or "")
    msg["To"] = clean_text(to_email)

    try:
        with smtplib.SMTP(os.getenv("EMAIL_HOST"), int(os.getenv("EMAIL_PORT"))) as server:
            server.starttls()
            server.login(
                clean_text(os.getenv("EMAIL_USERNAME") or ""),
                clean_text(os.getenv("EMAIL_PASSWORD") or "")
            )
            server.send_message(msg)
        print(f"✅ Email sent to {msg['To']}")
    except Exception as e:
        print(f"❌ Failed to send email: {e}")


def notify_reviewers(flagged_items: List[Tuple[AccessItem, List[str]]], method="email"):
    if method != "email":
        print("Only email notifications are supported in this mode.")
        return

    for item, reasons in flagged_items:
        reviewer_email = get_reviewer_for(item)
        if not reviewer_email:
            print(f"⚠️  No reviewer found for {item.user_email}, skipping.")
            continue

        print(f"📧 Attempting to email reviewer at: {reviewer_email}")
        body = format_email(item, reasons)
        send_email(
            subject="Bouncr: Access Review Required",
            body=body,
            to_email=reviewer_email,
        )
