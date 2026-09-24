#!/usr/bin/env python3
"""Fill the database with a demo office: team, projects, phases, drawings and
two weeks of progress history.

  python -m architect_dashboard.seed           # adds demo data
  python -m architect_dashboard.seed --reset   # wipes the database first
"""
import argparse
import os
import random
from datetime import date, datetime, timedelta

from . import config, db

TEAM = [
    ("Anna Keller", "Principal architect", "Reviewing Seefeld tender documents"),
    ("Luca Moretti", "Project architect", "Execution drawings · Office Enge"),
    ("Sofia Brunner", "Project architect", "Massing options · Bahnhofplatz"),
    ("Jonas Weber", "Architect", "Tender package · Villa am Hang"),
    ("Mia Frei", "Draughtsperson / BIM", "Facade details in Revit"),
    ("Noah Graf", "Site architect", "Site visit Arosa, back Thursday"),
]

STATUS = {"25-010": "on_hold", "22-008": "completed"}  # everything else is active

BLOCKERS = {
    "25-002": "Waiting on structural calcs for the cantilever",
    "23-021": "Heritage office: window replacement not approved yet",
}

# Typical checklist for each phase of the default (Atelier) template
MILESTONES = {
    "INQ": ["Intro call", "Site visit", "Fee proposal", "Appointment signed"],
    "CON": ["Site analysis", "Massing options", "Client workshop"],
    "SD": ["Brief locked", "Schematic booklet", "Cost check"],
    "DD": ["Consultant kickoff", "DD plan set", "Outline spec", "Client DD review"],
    "CD": ["CD 50%", "Door & window schedules", "Spec book", "Issue for tender"],
    "PER": ["Submit permit package", "Authority comments answered", "Permit granted"],
    "CA": ["Site start", "Weekly RFI log", "Shell complete", "Fit-out", "Snagging"],
    "CLO": ["Handover inspection", "As-built documents", "Final account"],
}

# code, name, client, location, lead, months since start, months total, how far along (0-1)
PROJECTS = [
    ("24-011", "Residential Tower Seefeld", "Seefeld Immobilien AG", "Zürich", "Luca Moretti", 14, 30, 0.52),
    ("24-017", "School Extension Oberdorf", "Gemeinde Oberdorf", "Oberdorf", "Sofia Brunner", 11, 20, 0.62),
    ("25-002", "Villa am Hang", "Private client", "Küsnacht", "Jonas Weber", 7, 16, 0.38),
    ("25-006", "Office Refurbishment Enge", "Enge Offices SA", "Zürich", "Luca Moretti", 5, 10, 0.55),
    ("25-013", "Mixed-use Bahnhofplatz", "SBB Immobilien", "Winterthur", "Sofia Brunner", 3, 36, 0.08),
    ("23-021", "Chalet Renovation Arosa", "Private client", "Arosa", "Noah Graf", 28, 26, 0.93),
    ("26-001", "Haus am See", "Private client", "Meilen", "Anna Keller", 0.3, 18, 0.02),
    ("25-010", "Loft Conversion Kreis 5", "Loftwerk GmbH", "Zürich", "Jonas Weber", 6, 14, 0.27),
    ("22-008", "Kindergarten Wiesental", "Stadt Winterthur", "Winterthur", "Sofia Brunner", 30, 24, 1.0),
]

DRAWINGS = [
    ("A-100", "Site plan", "Architecture", "1:500"),
    ("A-101", "Ground floor plan", "Architecture", "1:100"),
    ("A-102", "Upper floor plans", "Architecture", "1:100"),
    ("A-110", "Roof plan", "Architecture", "1:100"),
    ("A-200", "Sections A–A, B–B", "Architecture", "1:100"),
    ("A-300", "Elevations", "Architecture", "1:100"),
    ("A-500", "Facade details", "Architecture", "1:20"),
    ("A-510", "Window details", "Architecture", "1:5"),
    ("S-100", "Structural coordination", "Structure", "1:100"),
    ("M-100", "HVAC coordination", "MEP", "1:100"),
]


def _month(d: date, months: int) -> date:
    return d + timedelta(days=round(months * 30.4))


def seed(reset: bool = False) -> None:
    if reset and os.path.exists(config.DB_PATH):
        os.remove(config.DB_PATH)
    db.init_db()
    rng = random.Random(7)
    today = date.today()

    with db.connect() as conn:
        members = {}
        for name, role, status in TEAM:
            members[name] = db.upsert_member(conn, name, role)
            db.update_member(conn, members[name], {"status": status})
        staff = [m for n, m in members.items() if n != "Anna Keller"]

        for code, name, client, location, lead, elapsed, total, done in PROJECTS:
            if db.project_id_by_code(conn, code):
                continue
            start = _month(today, -elapsed)
            project_id = db.create_project(conn, {
                "code": code, "name": name, "client": client, "location": location,
                "lead_id": members[lead], "start_date": start.isoformat(),
                "due_date": _month(start, total).isoformat(),
            }, template=db.DEFAULT)

            phases = db.list_phases(conn, project_id)
            weight_total = sum(p["weight"] for p in phases)
            cursor, cumulative = start, 0.0
            for phase in phases:
                share = phase["weight"] / weight_total
                end = cursor + timedelta(days=max(14, round(total * 30.4 * share)))
                # progress of this phase given how far along the whole project is
                target = max(0.0, min(1.0, (done - cumulative) / share)) * 100
                target = round(target / 5) * 5
                if 0 < target < 100:  # a bit of noise so not everything is on schedule
                    target = max(5, min(95, target + rng.choice([-15, -10, 0, 0, 5, 10])))
                db.update_phase(conn, phase["id"], {
                    "planned_start": cursor.isoformat(), "planned_end": end.isoformat(),
                    "assignee_id": rng.choice(staff),
                })
                _backfill(conn, phase["id"], target, today, rng, members[lead])
                cursor, cumulative = end, cumulative + share

            _milestones(conn, project_id)
            _contacts(conn, project_id, code, client, rng)
            if code in STATUS:
                db.update_project(conn, project_id, {"status": STATUS[code]})
            if code in BLOCKERS:
                db.update_project(conn, project_id, {"blocker": BLOCKERS[code]})

            phase_by_code = {p["code"]: p["id"] for p in phases}
            if done < 0.05:
                continue  # still an enquiry: no drawings yet
            for number, title, discipline, scale in DRAWINGS:
                if done < 0.1 and number in ("A-500", "A-510", "S-100", "M-100"):
                    continue
                stage_pool = list(("draft", "in_progress", "review", "approved", "issued"))
                bias = min(4, int(done * 5))
                stage = stage_pool[max(0, min(4, bias + rng.choice([-2, -1, 0, 0, 1])))]
                db.upsert_drawing(conn, project_id, {
                    "number": number, "title": title, "discipline": discipline, "scale": scale,
                    "revision": rng.choice(["A", "B", "C"]), "stage": stage,
                    "phase_id": phase_by_code.get("CD" if scale in ("1:20", "1:5") else "DD"),
                    "assignee_id": rng.choice(staff),
                    "due_date": (today + timedelta(days=rng.randint(-5, 40))).isoformat(),
                }, source="seed")
    print(f"Demo data ready in {config.DB_PATH}")


def _milestones(conn, project_id: int) -> None:
    """Checklist items for each phase, ticked to roughly match its progress
    (without changing the progress history the backfill created)."""
    for phase in db.list_phases(conn, project_id):
        titles = MILESTONES.get(phase["code"], [])
        done_count = round(len(titles) * phase["progress"] / 100)
        for position, title in enumerate(titles, start=1):
            conn.execute(
                "INSERT OR IGNORE INTO milestones (phase_id, title, position, done, done_at) VALUES (?, ?, ?, ?, ?)",
                (phase["id"], title, position, 1 if position <= done_count else 0,
                 db.now() if position <= done_count else None),
            )


def _contacts(conn, project_id: int, code: str, client: str, rng) -> None:
    domain = client.lower().replace(" ", "").replace("ag", "").replace("sa", "")[:12] or "client"
    if client == "Private client":
        people = [("Claudia Meier", "client", "Owner", True), ("Peter Meier", "client", "Owner", True)]
    else:
        people = [(rng.choice(["Martin Huber", "Sandra Kunz", "Reto Baumann", "Nadia Schmid"]), "client",
                   "Client project manager", True)]
    people += [
        (rng.choice(["Ruth Lehmann", "Marco Bianchi", "Urs Fischer"]), "consultant", "Structural engineer", False),
        (rng.choice(["Karin Vogel", "Stefan Roth"]), "consultant", "HVAC engineer", False),
    ]
    for name, kind, role, notify in people:
        first, last = name.lower().split()
        email_domain = f"{domain}.example" if kind == "client" else f"{last}-ing.example"  # reserved TLD: never a real inbox
        db.upsert_contact(conn, project_id, {"name": name, "kind": kind, "role": role, "notify": notify,
                                             "email": f"{first}.{last}@{email_domain}"})


def _backfill(conn, phase_id: int, target: float, today: date, rng, member_id: int) -> None:
    """Record progress as if it had been updated over the past two weeks."""
    if target <= 0:
        return
    if target >= 100:
        stamp = datetime.combine(today - timedelta(days=30), datetime.min.time()).isoformat()
        db.set_phase_progress(conn, phase_id, 100, source="seed", logged_at=stamp)
        return
    value = max(0.0, target - rng.choice([10, 15, 20, 25]))
    for days_ago in range(14, -1, -1):
        if days_ago and rng.random() < 0.6:
            continue
        remaining = target - value
        value = target if days_ago == 0 else value + remaining * rng.uniform(0.2, 0.5)
        hour = rng.randint(8, 17) if days_ago else min(datetime.now().hour, 9)
        stamp = datetime.combine(today - timedelta(days=days_ago), datetime.min.time()).replace(hour=hour)
        db.set_phase_progress(conn, phase_id, round(value), member_id=member_id, source="seed",
                              logged_at=stamp.isoformat(timespec="seconds"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="delete the existing database first")
    seed(parser.parse_args().reset)
