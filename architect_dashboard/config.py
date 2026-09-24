import os
from dotenv import load_dotenv

load_dotenv()

OFFICE_NAME = os.getenv("OFFICE_NAME", "Studio")
DB_PATH = os.getenv("STUDIO_DB_PATH", "studio.db")

# Phases given to new projects unless another template is chosen: atelier | sia112 | international
DEFAULT_PHASE_TEMPLATE = os.getenv("DEFAULT_PHASE_TEMPLATE", "atelier")

# How often the wall dashboard refreshes itself (seconds)
DASHBOARD_REFRESH_SECONDS = int(os.getenv("DASHBOARD_REFRESH_SECONDS", "60"))

# A phase is flagged "at risk" when its progress trails the schedule by more
# than this many percentage points.
AT_RISK_TOLERANCE = float(os.getenv("AT_RISK_TOLERANCE", "10"))

# Google Drive (service account JSON key; share the files/folders with its email)
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "")
GDRIVE_SYNC_MINUTES = int(os.getenv("GDRIVE_SYNC_MINUTES", "15"))  # 0 disables auto-sync

# Gmail (OAuth, each team member connects their own mailbox)
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
# Where people open the app; Google sends them back to PUBLIC_BASE_URL/api/gmail/callback
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
# Long random string: encrypts stored Gmail tokens and signs the OAuth handshake. Keep it secret
# and don't change it, or everyone has to reconnect Gmail.
STUDIO_SECRET_KEY = os.getenv("STUDIO_SECRET_KEY", "")
GMAIL_SYNC_MINUTES = int(os.getenv("GMAIL_SYNC_MINUTES", "10"))  # 0 disables auto-sync
GMAIL_LOOKBACK_DAYS = int(os.getenv("GMAIL_LOOKBACK_DAYS", "30"))
