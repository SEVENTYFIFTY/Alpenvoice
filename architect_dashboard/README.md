# Atelier Studio Board: project progress for architecture offices

The principal architect gets one screen, meant to stay open all day on a monitor or wall TV. It shows every
project the team is working on: which phase each one is in, how far along it is, whether it is on
schedule, how much moved today, and where each drawing stands.

## What it does

| | |
|---|---|
| **Board** | A Kanban board with one column per phase. Drag a project to its next phase and Atelier completes the earlier phases, ticks their milestones, and logs the move. If any of the project's contacts are marked *notify on phase change*, it also prepares an email draft (to, subject, text). Open it in Gmail or your mail app, check it, and send it yourself. Nothing is sent automatically. Filter by *Needs attention* or by person. |
| **Milestones** | A checklist per phase ("DD plan set", "Permit submission"…). When a phase has milestones, ticking them sets its % on the dashboard and the board. |
| **Blockers** | "Waiting on structural calcs": set it on a project and it appears on the card and in the *Needs attention* panel with how long it has been blocking. Mark it resolved when it's done. |
| **People** | Client, consultant, authority and contractor contacts per project, each with a *notify on phase change* switch. Every team member keeps a one-line "what I'm working on" status that shows on the dashboard. |
| **Wall dashboard** | One card per project. Each card shows overall % with the "plan today" marker, the change today and over 7 days, a phase strip, a 14-day trend, drawing stages and the deadline countdown. It refreshes itself every 60 s. Filter by architect and sort by "needs attention first". |
| **Schedule health** | Each phase is *On track*, *At risk* (more than 10 points behind its planned dates) or *Overdue*. A project takes the status of its most serious phase. |
| **Phases** | SIA 112 phases (21 Preliminary studies → 53 Handover) or an international (AIA-style) sequence, created automatically. Phases are weighted, so Construction project counts more than Building permit. Weights, names and dates can all be edited. |
| **Drawings** | A drawing register per project. Each drawing moves through Draft → In progress → In review → Approved → Issued, and has a revision, a scale, an owner and a due date. |
| **Daily updates** | Team members open *Update progress*, pick their name, move a slider and optionally write a note ("Facade details sent to engineer"). Every change is logged, which feeds the daily deltas, trends and the *Latest updates* feed. |
| **Excel** | Download the template, fill in the Team, Projects, Phases, Milestones, Drawings and Contacts sheets, then upload it. Rows are matched by project code, phase name and drawing number, so re-uploading updates instead of duplicating. *Export everything* produces the same format plus a Summary sheet. |
| **Google Drive** | Link a Google Sheet (or an .xlsx in Drive) in the template's layout. It syncs automatically every 15 min. Link each project to its Drive folder to see the latest plans and documents inside the project view. |

## Run it

```bash
pip install -r architect_dashboard/requirements.txt
python -m architect_dashboard.seed --reset          # optional: demo office with 6 projects
uvicorn architect_dashboard.app:app --host 0.0.0.0 --port 8000
```

- Wall screen: `http://<server>:8000/`. Press ⛶ for full screen; ◐ switches between light and dark.
- Board: `http://<server>:8000/#board`
- Team updates: `http://<server>:8000/#manage`
- Excel / Drive / team: `http://<server>:8000/#data`
- API docs: `http://<server>:8000/docs`

Settings are read from environment variables or `.env` (see `.env.example`): `OFFICE_NAME`,
`STUDIO_DB_PATH`, `DASHBOARD_REFRESH_SECONDS`, `AT_RISK_TOLERANCE`, `GOOGLE_SERVICE_ACCOUNT_FILE`,
`GDRIVE_SYNC_MINUTES`.

## Connecting Google Drive

1. In Google Cloud Console, create a project and enable the **Google Drive API**.
2. Create a **service account**, add a JSON key and save it on the server.
   Then set `GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/key.json`.
3. Share the tracking spreadsheet and the project folders with the service account's email address
   (`…@….iam.gserviceaccount.com`). Viewer access is enough.
4. Under *Data & sync*, paste the spreadsheet link. For each project, paste its Drive folder link
   into *Update progress → Google Drive folder*.

## How progress is calculated

- **Project %** = Σ(phase % × phase weight) / Σ weights
- **Plan today** = how far through the planned start → due window today falls
- **At risk** = progress is more than `AT_RISK_TOLERANCE` points below the plan. **Overdue** = past the end date and not at 100%.
- **Today / 7d** = current % minus the % recorded at midnight (or 7 days ago), taken from the progress log

## Layout

```
architect_dashboard/
  app.py        FastAPI routes (dashboard, projects, phases, drawings, Excel, Drive)
  db.py         SQLite schema + data access; every progress change is written to progress_log
  progress.py   weighted progress, schedule health, daily deltas, history, team workload, board columns
  notify.py     phase-change email drafts (Gmail compose link / mailto)
  phases.py     SIA 112 / international phase templates, drawing stages
  excel_io.py   workbook import (upsert) and export
  gdrive.py     Drive API: Sheets export, folder listing, background sync
  seed.py       demo data
  static/       the dashboard (plain HTML/CSS/JS, no build step)
  tests/        pytest suite
```

## Not built yet

- Logins and roles. Right now anyone on the network can edit, so run it on the office LAN or VPN, or
  put it behind a reverse proxy with authentication.
- An inbox panel of unanswered client and consultant threads per project. This needs Gmail API access
  (OAuth for each user), so project mail can be matched by contact email address.
- Sending phase-change emails directly from the server (today they are drafts that someone reviews and sends).
- Writing changes back to Google Sheets (sync currently only reads from Drive into the dashboard).
- Microsoft 365 / OneDrive / SharePoint Excel sync. It would reuse the same importer via the Graph API.
- Hours and fees per phase (budget vs. actual), and email or Slack alerts when a project turns *At risk*.
