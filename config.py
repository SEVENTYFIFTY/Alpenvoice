import os
from dotenv import load_dotenv

load_dotenv()

# Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-opus-4-7"

# Email
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "")
FROM_NAME = os.getenv("FROM_NAME", "Alpenvoice Sales")

# Zoom
ZOOM_ACCOUNT_ID = os.getenv("ZOOM_ACCOUNT_ID", "")
ZOOM_CLIENT_ID = os.getenv("ZOOM_CLIENT_ID", "")
ZOOM_CLIENT_SECRET = os.getenv("ZOOM_CLIENT_SECRET", "")
ZOOM_HOST_EMAIL = os.getenv("ZOOM_HOST_EMAIL", "")

# Business
BUSINESS_NAME = os.getenv("BUSINESS_NAME", "Alpenvoice")
BUSINESS_DESCRIPTION = os.getenv(
    "BUSINESS_DESCRIPTION",
    "AI-powered voice solutions for hospitality and fitness businesses",
)
SALES_REP_NAME = os.getenv("SALES_REP_NAME", "Alex")
SALES_REP_TITLE = os.getenv("SALES_REP_TITLE", "Account Executive")
CALENDAR_URL = os.getenv("CALENDAR_URL", "")

# Agent
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"
FOLLOW_UP_DAYS = int(os.getenv("FOLLOW_UP_DAYS", "3"))
MAX_FOLLOW_UPS = int(os.getenv("MAX_FOLLOW_UPS", "2"))
DB_PATH = os.getenv("DB_PATH", "prospects.db")
