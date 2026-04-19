"""
Core AI outreach agent — uses Claude with tool use to contact cold prospects,
send follow-ups, and schedule Zoom discovery calls.
"""
import json
from datetime import datetime, timedelta
import anthropic
import config
import database
from email_service import send_email
from zoom_service import create_zoom_meeting

client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

def _build_system_prompt() -> str:
    return f"""You are an expert B2B sales outreach agent for {config.BUSINESS_NAME}.

About {config.BUSINESS_NAME}: {config.BUSINESS_DESCRIPTION}

Your role:
1. Contact cold prospects (hotels, restaurants, gyms) with short, personalized, value-driven emails.
2. Follow up with prospects who haven't responded (max {config.MAX_FOLLOW_UPS} follow-ups).
3. Schedule Zoom discovery calls with interested prospects.
4. Keep detailed notes on every interaction.

Sales representative: {config.SALES_REP_NAME}, {config.SALES_REP_TITLE}
{f"Calendar link: {config.CALENDAR_URL}" if config.CALENDAR_URL else ""}

Email writing guidelines:
- Cold outreach: 150–200 words, one clear CTA, focus on their pain point, not features.
- Follow-up 1: 80–100 words, different angle or social proof.
- Follow-up 2: 50–70 words, light "just checking in" tone, easy opt-out.
- Personalise every email to the prospect's business type:
    Hotels    → guest experience, front-desk load, multilingual support, check-in inquiries
    Restaurants → reservation management, missed calls during service rush, phone interruptions
    Gyms      → member inquiry overload, class scheduling, 24/7 support for leads
- Sign off with: {config.SALES_REP_NAME} | {config.SALES_REP_TITLE} | {config.BUSINESS_NAME}

Zoom scheduling rules:
- Suggest times 3–5 business days from today during 9am–5pm ET, Mon–Fri.
- Default duration: 30 minutes.
- Include a clear 3-point agenda in the invite email.

Today's date: {datetime.now().strftime("%A, %B %d, %Y")}
"""


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "get_prospects_due",
        "description": (
            "Get prospects ready for initial outreach or follow-up. "
            "Use status_filter='all' to get both new prospects and those overdue for follow-up."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status_filter": {
                    "type": "string",
                    "enum": ["new", "follow_up", "all"],
                    "description": "'new' = first contact only; 'follow_up' = overdue follow-ups only; 'all' = both",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max prospects to return (default 10)",
                },
            },
            "required": ["status_filter"],
        },
    },
    {
        "name": "get_prospect_details",
        "description": "Get full details and activity history for one prospect by ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prospect_id": {"type": "integer", "description": "Prospect database ID"},
            },
            "required": ["prospect_id"],
        },
    },
    {
        "name": "send_outreach_email",
        "description": (
            "Send a cold outreach or follow-up email. "
            "Craft personalised content before calling this tool."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "prospect_id": {"type": "integer"},
                "subject": {
                    "type": "string",
                    "description": "Subject line (≤ 60 chars, no ALL CAPS, no spam words)",
                },
                "body": {
                    "type": "string",
                    "description": "Full email body (plain text). Sign off as the sales rep.",
                },
                "email_type": {
                    "type": "string",
                    "enum": ["cold_outreach", "follow_up_1", "follow_up_2", "meeting_confirmation"],
                },
            },
            "required": ["prospect_id", "subject", "body", "email_type"],
        },
    },
    {
        "name": "schedule_zoom_meeting",
        "description": (
            "Create a Zoom meeting and send a calendar invite email to the prospect. "
            "Only use this when a prospect has expressed interest."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "prospect_id": {"type": "integer"},
                "meeting_title": {
                    "type": "string",
                    "description": "Short meeting topic, e.g. 'Alpenvoice Discovery Call – The Grand Hotel'",
                },
                "start_time": {
                    "type": "string",
                    "description": "ISO-8601 datetime, e.g. '2024-04-25T14:00:00'",
                },
                "duration_minutes": {
                    "type": "integer",
                    "description": "Meeting length in minutes (default 30)",
                },
                "meeting_agenda": {
                    "type": "string",
                    "description": "3-point agenda shown in the invite email",
                },
            },
            "required": ["prospect_id", "meeting_title", "start_time", "duration_minutes", "meeting_agenda"],
        },
    },
    {
        "name": "update_prospect_status",
        "description": "Update a prospect's status and append a note.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prospect_id": {"type": "integer"},
                "status": {
                    "type": "string",
                    "enum": [
                        "new", "contacted", "follow_up_1", "follow_up_2",
                        "meeting_scheduled", "converted", "not_interested", "no_response",
                    ],
                },
                "notes": {"type": "string", "description": "Brief note about this decision"},
                "follow_up_days": {
                    "type": "integer",
                    "description": "Schedule next follow-up N days from now (0 = none)",
                },
            },
            "required": ["prospect_id", "status"],
        },
    },
    {
        "name": "log_activity",
        "description": "Record an outreach activity in the activity log.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prospect_id": {"type": "integer"},
                "activity_type": {
                    "type": "string",
                    "enum": [
                        "email_sent", "follow_up_sent", "meeting_scheduled",
                        "call_made", "response_received", "note_added",
                    ],
                },
                "description": {"type": "string"},
                "metadata": {
                    "type": "object",
                    "description": "Extra info (email subject, zoom link, etc.)",
                },
            },
            "required": ["prospect_id", "activity_type", "description"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

def _execute_tool(name: str, inp: dict) -> str:
    """Dispatch a tool call and return JSON string result."""

    if name == "get_prospects_due":
        prospects = database.get_prospects_due(
            status_filter=inp.get("status_filter", "all"),
            limit=inp.get("limit", 10),
        )
        return json.dumps(
            {"prospects": prospects, "count": len(prospects)}
            if prospects
            else {"prospects": [], "message": "No prospects due right now."}
        )

    if name == "get_prospect_details":
        p = database.get_prospect_by_id(inp["prospect_id"])
        if not p:
            return json.dumps({"error": f"Prospect {inp['prospect_id']} not found"})
        p["recent_activities"] = database.get_activities(inp["prospect_id"], limit=5)
        return json.dumps(p)

    if name == "send_outreach_email":
        pid = inp["prospect_id"]
        p = database.get_prospect_by_id(pid)
        if not p:
            return json.dumps({"error": f"Prospect {pid} not found"})

        success, msg = send_email(
            to_email=p["contact_email"],
            subject=inp["subject"],
            body=inp["body"],
            to_name=p.get("contact_name", ""),
        )

        if not success:
            return json.dumps({"success": False, "error": msg})

        etype = inp["email_type"]
        status_map = {
            "cold_outreach": "contacted",
            "follow_up_1": "follow_up_1",
            "follow_up_2": "follow_up_2",
            "meeting_confirmation": "meeting_scheduled",
        }
        new_status = status_map.get(etype, "contacted")
        # Only schedule a follow-up for initial and first follow-up
        follow_up_days = config.FOLLOW_UP_DAYS if etype in ("cold_outreach", "follow_up_1") else 0

        database.update_prospect_status(pid, new_status, follow_up_days=follow_up_days)
        database.log_activity(
            pid,
            "email_sent" if etype == "cold_outreach" else "follow_up_sent",
            f"Sent {etype}: {inp['subject']}",
            {"subject": inp["subject"], "email_type": etype},
        )
        return json.dumps({"success": True, "sent_to": p["contact_email"], "new_status": new_status})

    if name == "schedule_zoom_meeting":
        pid = inp["prospect_id"]
        p = database.get_prospect_by_id(pid)
        if not p:
            return json.dumps({"error": f"Prospect {pid} not found"})

        meeting, err = create_zoom_meeting(
            topic=inp["meeting_title"],
            start_time=inp["start_time"],
            duration_minutes=inp.get("duration_minutes", 30),
            agenda=inp.get("meeting_agenda", ""),
        )
        if err:
            return json.dumps({"success": False, "error": err})

        # Send calendar invite email
        try:
            dt = datetime.fromisoformat(inp["start_time"])
            date_str = dt.strftime("%A, %B %d, %Y")
            time_str = dt.strftime("%I:%M %p ET")
        except ValueError:
            date_str = inp["start_time"]
            time_str = ""

        agenda_text = inp.get("meeting_agenda") or (
            "1. Brief intro" + "\n" + "2. Your current challenges" + "\n" + "3. How Alpenvoice can help"
        )
        contact = p.get("contact_name") or "there"
        rep_line = f"{config.SALES_REP_NAME}\n{config.SALES_REP_TITLE} | {config.BUSINESS_NAME}"
        invite_body = (
            f"Hi {contact},\n\n"
            "I've reserved a Zoom call for us — looking forward to connecting!\n\n"
            "Meeting details\n"
            "───────────────\n"
            f"Topic:    {inp['meeting_title']}\n"
            f"Date:     {date_str}\n"
            f"Time:     {time_str}\n"
            f"Duration: {inp.get('duration_minutes', 30)} minutes\n\n"
            f"Join Zoom: {meeting['join_url']}\n\n"
            "Agenda\n"
            "───────────────\n"
            f"{agenda_text}\n\n"
            "If the time doesn't work, please reply and we'll find something that does.\n\n"
            f"Talk soon,\n{rep_line}\n"
        )
        send_email(
            to_email=p["contact_email"],
            subject=f"Meeting confirmed: {inp['meeting_title']} – {date_str}",
            body=invite_body,
            to_name=p.get("contact_name", ""),
        )

        database.update_prospect_status(
            pid, "meeting_scheduled",
            notes=f"Zoom: {inp['start_time']} | {meeting['join_url']}",
        )
        database.log_activity(
            pid, "meeting_scheduled",
            f"Zoom meeting: {inp['meeting_title']} on {inp['start_time']}",
            {"zoom_url": meeting["join_url"], "meeting_id": meeting.get("id")},
        )
        return json.dumps({"success": True, "zoom_url": meeting["join_url"], "meeting_id": meeting.get("id")})

    if name == "update_prospect_status":
        ok = database.update_prospect_status(
            inp["prospect_id"],
            inp["status"],
            notes=inp.get("notes", ""),
            follow_up_days=inp.get("follow_up_days", 0),
        )
        if ok and inp.get("notes"):
            database.log_activity(inp["prospect_id"], "note_added",
                                  f"Status → {inp['status']}: {inp.get('notes','')}")
        return json.dumps({"success": ok, "new_status": inp["status"]})

    if name == "log_activity":
        aid = database.log_activity(
            inp["prospect_id"],
            inp["activity_type"],
            inp["description"],
            inp.get("metadata"),
        )
        return json.dumps({"success": True, "activity_id": aid})

    return json.dumps({"error": f"Unknown tool: {name}"})


# ---------------------------------------------------------------------------
# Main agentic loop
# ---------------------------------------------------------------------------

def run_outreach_cycle(max_prospects: int = 5, verbose: bool = True) -> dict:
    """
    Run one full outreach cycle: contact new prospects and send follow-ups.
    Returns a summary dict with actions_taken list.
    """
    database.init_db()

    if verbose:
        print(f"\n{'='*60}")
        print(f"  Alpenvoice AI Outreach Agent")
        print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  |  "
              f"Mode: {'DRY RUN' if config.DRY_RUN else 'LIVE'}")
        print(f"{'='*60}")

    task = f"""Run today's outreach cycle. Steps:

1. Call get_prospects_due(status_filter='all', limit={max_prospects}) to see who needs attention.
2. For each prospect:
   a. Call get_prospect_details to review their info and history.
   b. Decide the right action:
      - status='new'            → write & send a cold outreach email
      - status='contacted'      → it's been {config.FOLLOW_UP_DAYS}+ days, send follow_up_1
      - status='follow_up_1'   → send follow_up_2 (last attempt)
      - notes mention interest  → schedule a Zoom call instead of emailing
   c. Send the email or schedule the Zoom.
   d. update_prospect_status with appropriate status + a short note.
3. After processing all prospects, give a concise summary of what you did.

Important:
- Tailor every email to the prospect's industry.
- For Zoom scheduling, suggest a date 3–5 business days from today ({datetime.now().strftime('%Y-%m-%d')}).
- Do not email prospects with status 'meeting_scheduled', 'converted', 'not_interested', or 'no_response'.
"""

    messages: list[dict] = [{"role": "user", "content": task}]
    actions_taken: list[dict] = []

    while True:
        response = client.messages.create(
            model=config.MODEL,
            max_tokens=4096,
            system=_build_system_prompt(),
            tools=TOOLS,
            messages=messages,
            thinking={"type": "adaptive"},
        )

        if response.stop_reason == "end_turn":
            if verbose:
                summary = " ".join(
                    b.text for b in response.content if b.type == "text"
                )
                print(f"\n{'─'*60}")
                print(summary)
            break

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []

            for block in response.content:
                if block.type != "tool_use":
                    continue

                if verbose:
                    snippet = json.dumps(block.input)[:100]
                    print(f"  → {block.name}({snippet}{'...' if len(json.dumps(block.input)) > 100 else ''})")

                result_str = _execute_tool(block.name, block.input)
                result_data = json.loads(result_str)

                if block.name in ("send_outreach_email", "schedule_zoom_meeting"):
                    if result_data.get("success"):
                        actions_taken.append({
                            "action": block.name,
                            "prospect_id": block.input.get("prospect_id"),
                            "detail": block.input.get("subject") or block.input.get("meeting_title"),
                        })

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result_str,
                })

            messages.append({"role": "user", "content": tool_results})
        else:
            # pause_turn or unexpected — break to avoid infinite loop
            break

    if verbose:
        print(f"\n✓ Cycle complete — {len(actions_taken)} action(s) taken")
        for a in actions_taken:
            print(f"  • {a['action']} (prospect {a['prospect_id']}): {a['detail']}")

    return {
        "timestamp": datetime.now().isoformat(),
        "actions_taken": actions_taken,
        "dry_run": config.DRY_RUN,
    }
