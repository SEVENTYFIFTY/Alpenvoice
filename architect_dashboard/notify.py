"""Phase-change emails to the project's clients and consultants.

Builds a ready-to-send draft — the team member reviews it in Gmail (or their
own mail client) before anything leaves the office. Nothing is sent from the server.
"""
from urllib.parse import quote, urlencode

from . import config


def phase_change_email(project: dict, phase: dict, contacts: list[dict], sender: dict = None) -> dict:
    recipients = [c for c in contacts if c["notify"] and c.get("email")]
    first_names = [c["name"].split()[0] for c in recipients]
    greeting = f"Dear {', '.join(first_names)}," if first_names else "Hello,"
    subject = f"{project['code']} {project['name']}: now in {phase['name']}"
    signature = sender["name"] if sender else config.OFFICE_NAME
    body = (
        f"{greeting}\n\n"
        f"A quick update on {project['name']}: we have completed the previous stage and the project "
        f"has now moved into the {phase['name']} phase.\n\n"
        f"We will be in touch about the next steps and anything we need from you.\n\n"
        f"Kind regards,\n{signature}\n{config.OFFICE_NAME}"
    )
    to = ",".join(c["email"] for c in recipients)
    return {
        "to": [{"name": c["name"], "email": c["email"]} for c in recipients],
        "subject": subject,
        "body": body,
        # Opens a pre-filled compose window in the signed-in Gmail account
        "gmail_url": "https://mail.google.com/mail/?" + urlencode({"view": "cm", "fs": "1", "to": to, "su": subject, "body": body}),
        # Any default mail client (Outlook, Apple Mail…)
        "mailto_url": f"mailto:{quote(to, safe='@,')}?subject={quote(subject)}&body={quote(body)}",
    }
