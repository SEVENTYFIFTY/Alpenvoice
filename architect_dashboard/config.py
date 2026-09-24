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
