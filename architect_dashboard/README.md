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
| **Live, all projects** | The dashboard updates by itself within about a second whenever anyone saves a change, and briefly outlines what changed in gold. The ● Live light in the top bar shows the connection. Active, on-hold and completed projects are all shown, grouped in that order (filter with *All projects*). Three views: **Cards** (one per project); **Stages** (a grid of every project × every phase with its %, the current phase outlined, late phases marked); **Timeline** (planned phases on a calendar with a Today line and deadlines). **⟳ Wall mode** cycles Cards → Stages → Timeline → Board every 30 s and slowly scrolls long pages. Wall-display links turn it on automatically. |
| **Wall dashboard** | One card per project. Each card shows overall % with the "plan today" marker, the change today and over 7 days, a phase strip, a 14-day trend, drawing stages and the deadline countdown. It refreshes itself every 60 s. Filter by architect and sort by "needs attention first". |
| **Schedule health** | Each phase is *On track*, *At risk* (more than 10 points behind its planned dates) or *Overdue*. A project takes the status of its most serious phase. |
| **Phases** | New projects get the studio's stages by default: Inquiry (5) → Concept (10) → Schematic design (15) → Design development (20) → Construction documents (25) → Permitting (10) → Construction administration (10) → Closeout (5). The number is each phase's weight in the overall %. The SIA 112 and international (AIA-style) sequences are also available. Set `DEFAULT_PHASE_TEMPLATE` to change the default. Weights, names and dates can all be edited. |
| **Drawings** | A drawing register per project. Each drawing moves through Draft → In progress → In review → Approved → Issued, and has a revision, a scale, an owner and a due date. |
| **Daily updates** | Team members open *Update progress*, pick their name, move a slider and optionally write a note ("Facade details sent to engineer"). Every change is logged, which feeds the daily deltas, trends and the *Latest updates* feed. |
| **Excel** | Download the template, fill in the Team, Projects, Phases, Milestones, Drawings and Contacts sheets, then upload it. Rows are matched by project code, phase name and drawing number, so re-uploading updates instead of duplicating. *Export everything* produces the same format plus a Summary sheet. |
| **Gmail** | Each person connects their own Gmail. The dashboard gets a *Waiting on us · mail* panel with client and consultant emails where the contact wrote last, showing how long it has waited and which inbox it's in. Cards show ✉ counts, and each project has a Mail tab. *Move + Gmail draft* on the board saves the phase-change email in your Gmail Drafts. Only sender, subject and date are read, never message text, and nothing is ever sent automatically. |
| **Google Drive** | Link a Google Sheet (or an .xlsx in Drive) in the template's layout. It syncs automatically every 15 min. Link each project to its Drive folder to see the latest plans and documents inside the project view. |

## Run it

```bash
pip install -r architect_dashboard/requirements.txt
python -m architect_dashboard.seed --reset          # optional: demo office with 6 projects
uvicorn architect_dashboard.app:app --host 0.0.0.0 --port 8000
```

- First visit: `http://<server>:8000/` asks the principal to create their account (see *Sign-in and roles*).
- Wall screen: use a display link (below). Press ⛶ for full screen; ◐ switches between light and dark.
- Board: `http://<server>:8000/#board`
- Team updates: `http://<server>:8000/#manage`
- Excel / Drive / team: `http://<server>:8000/#data`
- API docs: `http://<server>:8000/docs`

Settings are read from environment variables or `.env` (see `.env.example`): `OFFICE_NAME`,
`STUDIO_DB_PATH`, `DEFAULT_PHASE_TEMPLATE`, `DASHBOARD_REFRESH_SECONDS`, `AT_RISK_TOLERANCE`, `GOOGLE_SERVICE_ACCOUNT_FILE`,
`GDRIVE_SYNC_MINUTES`.

## Sign-in and roles

Everyone signs in with their email and a password (10+ characters). There are three roles:

| Role | Can |
|---|---|
| **Principal** | Everything: manage the team and roles, invite people, wall displays, Excel import, Drive sources, delete projects |
| **Team** | Update projects, phases, milestones, drawings, contacts and blockers; move cards on the board; connect their own Gmail; export Excel |
| **Viewer** | Look only: dashboard, board and project details |

- **First run:** the first visit shows *Set up Atelier* and creates the principal's account. After that, the setup screen is gone for good.
- **Inviting the team:** under *Data & sync → Team*, add each person's email, choose their role and click
  **Invite link**. Send them the link; it works once and expires after 7 days. **Reset link** does the same
  for a forgotten password and signs that person out everywhere else. Setting a role to *No login* signs
  them out immediately.
- **Wall displays:** under *Data & sync → Wall displays*, create a link (e.g. "Studio TV") and open it once
  in the screen's browser. It stays signed in, read-only, for about a year. **Revoke** signs it out.
- **Locked out?** On the server, run `python -m architect_dashboard.auth invite you@studio.ch --admin`
  to print a new link.

Security notes:
- Passwords are hashed with scrypt.
- Sessions, invites and display links are random tokens, and only their hashes are stored.
- Sign-in attempts are throttled.
- Every change needs a signed-in session plus a custom request header, which blocks cross-site request
  forgery.
- Progress updates, board moves and Gmail connections are always recorded as the signed-in person.
- Serve Atelier over **HTTPS** outside a trusted network: with an `https://` `PUBLIC_BASE_URL`, session
  cookies are marked *Secure*.

## Connecting Google Drive

1. In Google Cloud Console, create a project and enable the **Google Drive API**.
2. Create a **service account**, add a JSON key and save it on the server.
   Then set `GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/key.json`.
3. Share the tracking spreadsheet and the project folders with the service account's email address
   (`…@….iam.gserviceaccount.com`). Viewer access is enough.
4. Under *Data & sync*, paste the spreadsheet link. For each project, paste its Drive folder link
   into *Update progress → Google Drive folder*.

## Connecting Gmail

Each team member connects their own mailbox, but an administrator first registers Atelier with Google once:

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project and
   enable the **Gmail API**.
2. Set up the **OAuth consent screen**.
   - **Google Workspace office (recommended):** choose user type **Internal**. Only your domain's
     accounts can connect, and Google doesn't need to review the app.
   - **Personal @gmail.com accounts:** choose **External**, leave it in *Testing* and add each
     person as a test user. Google expires tokens of apps in Testing after 7 days, so people will
     have to reconnect weekly. Publishing the app for wider use requires Google's verification,
     because it reads Gmail.
3. Create **Credentials → OAuth client ID → Web application**. Add the authorised redirect URI
   `PUBLIC_BASE_URL/api/gmail/callback`, e.g. `https://atelier.yourstudio.ch/api/gmail/callback`.
   Google only accepts plain `http://` for `localhost`, so an office server needs HTTPS.
4. Set on the server:
   ```bash
   GOOGLE_OAUTH_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=…
   PUBLIC_BASE_URL=https://atelier.yourstudio.ch
   STUDIO_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
   ```
   `STUDIO_SECRET_KEY` encrypts the stored Gmail tokens. Keep it secret and don't change it, or
   everyone has to reconnect.
5. Each person signs in, opens *Data & sync → Gmail* and clicks **Connect my Gmail**. It always connects
   the signed-in person's own mailbox.

What Atelier does with the access:
- **Read-only search.** Every 10 minutes (`GMAIL_SYNC_MINUTES`) it searches the last 30 days
  (`GMAIL_LOOKBACK_DAYS`) for threads to or from the email addresses under each project's *People*.
  It stores only sender, subject, date and message count, never the text. A thread is "waiting on
  us" when the contact sent the last message.
- **Drafts, never sending.** *Move + Gmail draft* creates a draft in the mover's own mailbox. It
  doesn't send anything.
- **Disconnect** removes the account and its threads from Atelier and revokes the access at Google.

Everyone who can sign in, including viewers and wall displays, sees the subjects and senders of those
project threads.

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
  gmail.py      Gmail OAuth, encrypted tokens, project-thread sync, drafts
  auth.py       passwords, sessions, roles, invites, wall-display links, recovery command
  seed.py       demo data
  static/       the dashboard (plain HTML/CSS/JS, no build step)
  tests/        pytest suite
```

## Not built yet

- Sign-in with Google or Microsoft accounts (single sign-on) and two-factor authentication.
- Outlook / Microsoft 365 mail (same idea as Gmail, via the Microsoft Graph API).
- Writing changes back to Google Sheets (sync currently only reads from Drive into the dashboard).
- Microsoft 365 / OneDrive / SharePoint Excel sync. It would reuse the same importer via the Graph API.
- Hours and fees per phase (budget vs. actual), and email or Slack alerts when a project turns *At risk*.
