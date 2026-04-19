import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import config


def send_email(
    to_email: str,
    subject: str,
    body: str,
    to_name: str = "",
) -> tuple[bool, str]:
    """Send an email via SMTP. Returns (success, message)."""
    if config.DRY_RUN:
        print(f"[DRY RUN] Email → {to_email} | Subject: {subject}")
        return True, "dry_run"

    if not config.SMTP_USER or not config.SMTP_PASSWORD:
        return False, "SMTP credentials not configured (set SMTP_USER / SMTP_PASSWORD in .env)"

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        from_addr = config.FROM_EMAIL or config.SMTP_USER
        msg["From"] = f"{config.FROM_NAME} <{from_addr}>"
        msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email

        mime_type = "html" if ("<p" in body or "<br" in body or "<div" in body) else "plain"
        msg.attach(MIMEText(body, mime_type))

        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(config.SMTP_USER, config.SMTP_PASSWORD)
            server.sendmail(from_addr, to_email, msg.as_string())

        return True, "sent"
    except smtplib.SMTPAuthenticationError:
        return False, "SMTP authentication failed — check SMTP_USER / SMTP_PASSWORD"
    except smtplib.SMTPException as e:
        return False, f"SMTP error: {e}"
    except Exception as e:
        return False, str(e)
