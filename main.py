#!/usr/bin/env python3
"""
Alpenvoice AI Outreach Agent — CLI entry point

Usage:
  python main.py run                          # Run an outreach cycle
  python main.py run --max-prospects 10       # Contact up to 10 prospects
  python main.py status                       # Dashboard
  python main.py import sample_prospects.json # Bulk import from JSON or CSV
  python main.py add                          # Add one prospect interactively
  python main.py activities                   # Recent activity log
  python main.py prospect 3                   # Details for prospect ID 3
"""
import sys
import json
import csv
import argparse

try:
    from tabulate import tabulate
except ImportError:
    def tabulate(data, headers=(), tablefmt="simple"):  # minimal fallback
        lines = ["  ".join(str(h) for h in headers)]
        lines += ["  ".join(str(c) for c in row) for row in data]
        return "\n".join(lines)

import config
import database
from outreach_agent import run_outreach_cycle


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_run(args):
    result = run_outreach_cycle(max_prospects=args.max_prospects, verbose=not args.quiet)
    if args.quiet:
        print(json.dumps(result, indent=2))


def cmd_status(args):
    database.init_db()
    prospects = database.get_all_prospects()

    if not prospects:
        print("No prospects yet. Run:  python main.py import sample_prospects.json")
        return

    status_counts: dict[str, int] = {}
    for p in prospects:
        s = p["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    print(f"\n{'='*55}")
    print(f"  Alpenvoice Outreach Dashboard — {len(prospects)} prospects")
    print(f"{'='*55}")
    print(f"\nStatus breakdown:")
    order = ["new", "contacted", "follow_up_1", "follow_up_2",
             "meeting_scheduled", "converted", "not_interested", "no_response"]
    for s in order:
        n = status_counts.get(s, 0)
        if n:
            print(f"  {s:<24} {n:>3}")

    print(f"\nProspect list (most recent first):")
    rows = []
    for p in prospects[:25]:
        rows.append([
            p["id"],
            (p["company_name"] or "")[:28],
            (p.get("industry") or "")[:12],
            (p["contact_email"] or "")[:28],
            p["status"],
            (p.get("last_contacted_at") or "never")[:10],
            (p.get("next_follow_up_date") or "—")[:10],
        ])
    print(tabulate(rows,
                   headers=["ID", "Company", "Industry", "Email", "Status", "Last Contact", "Next F/U"],
                   tablefmt="simple"))


def cmd_import(args):
    database.init_db()
    filepath = args.file

    try:
        f = open(filepath)
    except FileNotFoundError:
        print(f"Error: file not found: {filepath}")
        sys.exit(1)

    imported = 0

    if filepath.lower().endswith(".json"):
        data = json.load(f)
        f.close()
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict) and "prospects" in data:
            items = data["prospects"]
        else:
            print("JSON must be a list or {'prospects': [...]}")
            sys.exit(1)

        for p in items:
            email = p.get("contact_email") or p.get("email")
            if not email:
                print(f"  Skip (no email): {p.get('company_name','?')}")
                continue
            pid = database.add_prospect(
                company_name=p.get("company_name") or p.get("company", "Unknown"),
                contact_email=email,
                industry=p.get("industry", ""),
                contact_name=p.get("contact_name") or p.get("name", ""),
                contact_phone=p.get("contact_phone") or p.get("phone", ""),
                website=p.get("website", ""),
                location=p.get("location") or p.get("city", ""),
                notes=p.get("notes", ""),
            )
            print(f"  Imported: {p.get('company_name','?')} (ID {pid})")
            imported += 1

    elif filepath.lower().endswith(".csv"):
        reader = csv.DictReader(f)
        for row in reader:
            email = row.get("contact_email") or row.get("email")
            if not email:
                print(f"  Skip (no email): {row}")
                continue
            pid = database.add_prospect(
                company_name=row.get("company_name") or row.get("company", "Unknown"),
                contact_email=email,
                industry=row.get("industry", ""),
                contact_name=row.get("contact_name") or row.get("name", ""),
                contact_phone=row.get("contact_phone") or row.get("phone", ""),
                website=row.get("website", ""),
                location=row.get("location") or row.get("city", ""),
                notes=row.get("notes", ""),
            )
            print(f"  Imported: {row.get('company_name','?')} (ID {pid})")
            imported += 1
        f.close()
    else:
        f.close()
        print("Only .json and .csv files are supported")
        sys.exit(1)

    print(f"\nImported {imported} prospect(s)")


def cmd_add(args):
    database.init_db()
    print("=== Add New Prospect ===")
    company = input("Company name:               ").strip()
    industry = input("Industry (hotel/restaurant/gym/other): ").strip()
    name = input("Contact name:               ").strip()
    email = input("Contact email:              ").strip()
    phone = input("Phone (optional):           ").strip()
    website = input("Website (optional):         ").strip()
    location = input("Location/City (optional):   ").strip()
    notes = input("Notes (optional):           ").strip()

    if not company or not email:
        print("Company name and email are required.")
        sys.exit(1)

    pid = database.add_prospect(company, email, industry, name, phone, website, location, notes)
    print(f"\nAdded {company} as prospect ID {pid}")


def cmd_activities(args):
    database.init_db()
    activities = database.get_activities(limit=40)
    if not activities:
        print("No activities recorded yet.")
        return
    print(f"\n=== Recent Activities ===")
    rows = [
        [(a.get("created_at") or "")[:19],
         (a.get("company_name") or "?")[:22],
         a["activity_type"],
         (a.get("description") or "")[:55]]
        for a in activities
    ]
    print(tabulate(rows,
                   headers=["Time", "Company", "Type", "Description"],
                   tablefmt="simple"))


def cmd_prospect(args):
    database.init_db()
    p = database.get_prospect_by_id(args.id)
    if not p:
        print(f"Prospect {args.id} not found.")
        sys.exit(1)

    print(f"\n=== Prospect #{p['id']}: {p['company_name']} ===")
    fields = ["industry", "contact_name", "contact_email", "contact_phone",
              "website", "location", "status", "follow_up_count",
              "last_contacted_at", "next_follow_up_date", "notes",
              "created_at", "updated_at"]
    for f in fields:
        v = p.get(f) or "—"
        print(f"  {f:<24} {v}")

    activities = database.get_activities(p["id"])
    if activities:
        print(f"\n  Activity history ({len(activities)}):")
        for a in activities:
            print(f"    {(a.get('created_at') or '')[:19]}  {a['activity_type']:20}  {a.get('description','')[:60]}")


# ---------------------------------------------------------------------------
# CLI setup
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="alpenvoice",
        description="Alpenvoice AI Outreach Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command")

    p_run = sub.add_parser("run", help="Run an outreach cycle")
    p_run.add_argument("--max-prospects", type=int, default=5,
                       help="Max prospects per cycle (default 5)")
    p_run.add_argument("--quiet", action="store_true",
                       help="Suppress verbose output; print JSON summary instead")
    p_run.set_defaults(func=cmd_run)

    p_status = sub.add_parser("status", help="Show prospect dashboard")
    p_status.set_defaults(func=cmd_status)

    p_import = sub.add_parser("import", help="Import prospects from JSON or CSV")
    p_import.add_argument("file", help="Path to .json or .csv file")
    p_import.set_defaults(func=cmd_import)

    p_add = sub.add_parser("add", help="Add a single prospect interactively")
    p_add.set_defaults(func=cmd_add)

    p_act = sub.add_parser("activities", help="Show recent activity log")
    p_act.set_defaults(func=cmd_activities)

    p_pro = sub.add_parser("prospect", help="Show details for one prospect")
    p_pro.add_argument("id", type=int, help="Prospect ID")
    p_pro.set_defaults(func=cmd_prospect)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    args.func(args)


if __name__ == "__main__":
    main()
