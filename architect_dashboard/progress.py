"""Progress, schedule health and daily movement — everything the wall dashboard shows."""
from datetime import date, datetime, timedelta
from typing import Optional

from . import config, db
from .phases import DRAWING_STAGES

# Ordered from least to most serious; a project takes its most serious phase health.
HEALTH_ORDER = ["not_started", "done", "on_track", "at_risk", "overdue"]


def _parse(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def weighted_progress(phases: list[dict], key: str = "progress") -> float:
    total_weight = sum(p["weight"] for p in phases if p["weight"] > 0)
    if not total_weight:
        return 0.0
    return sum(p[key] * p["weight"] for p in phases if p["weight"] > 0) / total_weight


def expected_progress(start: Optional[str], end: Optional[str], today: date) -> Optional[float]:
    """Where progress should be today if work advanced linearly between start and end."""
    s, e = _parse(start), _parse(end)
    if not s or not e or e <= s:
        return None
    return max(0.0, min(100.0, (today - s).days / (e - s).days * 100))


def phase_health(phase: dict, today: date) -> str:
    if phase["progress"] >= 100:
        return "done"
    end = _parse(phase["planned_end"])
    if end and end < today:
        return "overdue"
    expected = expected_progress(phase["planned_start"], phase["planned_end"], today)
    if expected is None or expected == 0:
        return "on_track" if phase["progress"] > 0 else "not_started"
    if phase["progress"] < expected - config.AT_RISK_TOLERANCE:
        return "at_risk"
    return "on_track"


def worst(healths: list[str]) -> str:
    return max(healths, key=HEALTH_ORDER.index) if healths else "not_started"


def progress_at(phases: list[dict], log: list[dict], cutoff: str) -> float:
    """Overall project progress as it stood just before `cutoff` (ISO timestamp)."""
    latest: dict[int, float] = {}
    for entry in log:  # log is ordered by time
        if entry["logged_at"] >= cutoff:
            break
        latest[entry["phase_id"]] = entry["progress"]
    snapshot = [{**p, "progress": latest.get(p["id"], 0.0)} for p in phases]
    return weighted_progress(snapshot)


def daily_history(phases: list[dict], log: list[dict], today: date, days: int = 14) -> list[dict]:
    points = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        cutoff = (day + timedelta(days=1)).isoformat()
        points.append({"date": day.isoformat(), "progress": round(progress_at(phases, log, cutoff), 1)})
    return points


def drawing_stats(drawings: list[dict], today: date) -> dict:
    by_stage = {stage: 0 for stage in DRAWING_STAGES}
    overdue = 0
    for d in drawings:
        by_stage[d["stage"] if d["stage"] in by_stage else "not_started"] += 1
        due = _parse(d["due_date"])
        if due and due < today and d["stage"] != "issued":
            overdue += 1
    total = len(drawings)
    return {
        "total": total,
        "by_stage": by_stage,
        "overdue": overdue,
        "progress": round(sum(d["progress"] for d in drawings) / total, 1) if total else None,
    }


def project_summary(conn, project: dict, today: date) -> dict:
    phases = db.list_phases(conn, project["id"])
    drawings = db.list_drawings(conn, project["id"])
    log = db.phase_log(conn, project["id"])

    for phase in phases:
        phase["health"] = phase_health(phase, today)
        phase["expected"] = expected_progress(phase["planned_start"], phase["planned_end"], today)

    overall = weighted_progress(phases)
    start_of_today = today.isoformat()
    delta_today = overall - progress_at(phases, log, start_of_today)
    delta_week = overall - progress_at(phases, log, (today - timedelta(days=6)).isoformat())

    current = next((p for p in phases if p["progress"] < 100), None)

    healths = [p["health"] for p in phases if p["health"] != "done"]
    due = _parse(project["due_date"])
    if due and due < today and overall < 100:
        healths.append("overdue")
    expected = expected_progress(project["start_date"], project["due_date"], today)
    if expected and overall < expected - config.AT_RISK_TOLERANCE:
        healths.append("at_risk")
    health = "done" if phases and overall >= 100 else worst(healths)

    return {
        **project,
        "progress": round(overall, 1),
        "expected": round(expected, 1) if expected is not None else None,
        "delta_today": round(delta_today, 1),
        "delta_week": round(delta_week, 1),
        "health": health,
        "days_left": (due - today).days if due else None,
        "current_phase": current["name"] if current else None,
        "current_phase_code": current["code"] if current else None,
        "phases": phases,
        "drawings": drawing_stats(drawings, today),
        "history": daily_history(phases, log, today),
    }


def team_workload(conn) -> list[dict]:
    return db.rows(conn.execute(
        """SELECT m.id, m.name, m.role,
             (SELECT COUNT(*) FROM phases ph JOIN projects p ON p.id = ph.project_id
               WHERE ph.assignee_id = m.id AND ph.progress < 100 AND p.status = 'active') AS open_phases,
             (SELECT COUNT(*) FROM drawings d JOIN projects p ON p.id = d.project_id
               WHERE d.assignee_id = m.id AND d.stage != 'issued' AND p.status = 'active') AS open_drawings,
             (SELECT COUNT(*) FROM projects p WHERE p.lead_id = m.id AND p.status = 'active') AS leading,
             (SELECT MAX(logged_at) FROM progress_log l WHERE l.member_id = m.id) AS last_update
           FROM members m ORDER BY m.name"""
    ))


def dashboard(conn, today: Optional[date] = None) -> dict:
    today = today or date.today()
    projects = [project_summary(conn, p, today) for p in db.list_projects(conn)]
    active = [p for p in projects if p["status"] == "active"]
    counts = {h: sum(1 for p in active if p["health"] == h) for h in HEALTH_ORDER}
    return {
        "office": config.OFFICE_NAME,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "refresh_seconds": config.DASHBOARD_REFRESH_SECONDS,
        "kpis": {
            "active_projects": len(active),
            "average_progress": round(sum(p["progress"] for p in active) / len(active), 1) if active else 0,
            "moved_today": sum(1 for p in active if p["delta_today"] > 0),
            "points_today": round(sum(p["delta_today"] for p in active), 1),
            "health": counts,
            "drawings_open": sum(p["drawings"]["total"] - p["drawings"]["by_stage"]["issued"] for p in active),
            "drawings_in_review": sum(p["drawings"]["by_stage"]["review"] for p in active),
        },
        "projects": projects,
        "team": team_workload(conn),
        "activity": db.recent_activity(conn),
    }
