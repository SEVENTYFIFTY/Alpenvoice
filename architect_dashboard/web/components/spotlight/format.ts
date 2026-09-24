import type { Health } from "./types";

export const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v)}%`);

export const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso.slice(0, 10) + "T00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    : "–";

export const HEALTH: Record<Health, { label: string; icon: string; className: string }> = {
  overdue: { label: "Overdue", icon: "!", className: "bg-critical text-white" },
  at_risk: { label: "At risk", icon: "▲", className: "bg-warning text-[#1c1917]" },
  on_track: { label: "On track", icon: "✓", className: "bg-good text-white" },
  done: { label: "Complete", icon: "✓", className: "bg-progress text-[#11151d]" },
  not_started: { label: "Not started", icon: "–", className: "bg-white/40 text-[#11151d]" },
};

export const STATUS_LABEL: Record<string, string> = { active: "Active", on_hold: "On hold", completed: "Completed" };
