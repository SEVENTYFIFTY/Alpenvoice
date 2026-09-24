import { AlertTriangle, CalendarClock, FileStack, Mail } from "lucide-react";

import { cn } from "@/lib/utils";

import { HEALTH, STATUS_LABEL, fmtDate, pct } from "./format";
import type { Project } from "./types";

function HealthBadge({ project }: { project: Project }) {
  if (project.status !== "active") {
    return (
      <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
        {STATUS_LABEL[project.status] ?? project.status}
      </span>
    );
  }
  const h = HEALTH[project.health] ?? HEALTH.not_started;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-2.5 text-xs font-semibold text-white">
      <span className={cn("grid size-4 place-items-center rounded-full text-[10px] leading-none", h.className)} aria-hidden>
        {h.icon}
      </span>
      {h.label}
    </span>
  );
}

function Delta({ value, suffix }: { value: number; suffix: string }) {
  if (!value) return <span className="text-white/50">±0{suffix}</span>;
  return (
    <span className={cn("font-semibold", value > 0 ? "text-[#6ee26e]" : "text-[#ff9b9b]")}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

/** One project, drawn inside a CardStack card. */
export function ProjectCard({ project: p, active, changed }: { project: Project; active: boolean; changed: boolean }) {
  const current = p.phases.find((ph) => ph.id === p.current_phase_id);
  const issued = p.drawings.by_stage?.issued ?? 0;
  const late = p.days_left != null && p.days_left < 0 && p.progress < 100;

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col gap-3 bg-gradient-to-br from-navy to-navy-2 p-6 text-white",
        changed && "ring-4 ring-inset ring-gold transition-shadow",
      )}
    >
      {/* soft light in the corner */}
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/5 blur-2xl" aria-hidden />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs tracking-wide text-[#e0bf6a]">{p.code}</div>
          <div className="line-clamp-2 text-xl font-semibold leading-tight sm:text-2xl">{p.name}</div>
          <div className="truncate text-sm text-white/70">
            {[p.client, p.location, p.lead_name].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {p.mail_waiting > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#ffb4b4]" title="Emails waiting on a reply">
              <Mail className="size-3.5" /> {p.mail_waiting}
            </span>
          )}
          <HealthBadge project={p} />
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div className="text-6xl font-semibold leading-none tabular-nums">
          {Math.round(p.progress)}
          <span className="text-3xl text-white/60">%</span>
        </div>
        <div className="flex flex-col pb-1 text-sm">
          <span>
            <Delta value={p.delta_today} suffix=" today" /> <span className="text-white/40">·</span>{" "}
            <Delta value={p.delta_week} suffix=" 7d" />
          </span>
          <span className="text-white/60">{p.expected != null ? `Plan today ${pct(p.expected)}` : "No schedule set"}</span>
        </div>
      </div>

      {/* overall progress with the "where we should be" marker */}
      <div className="relative h-2 rounded-full bg-white/15" aria-label={`Overall ${pct(p.progress)}`}>
        <div className="h-full rounded-full bg-progress" style={{ width: `${p.progress}%` }} />
        {p.expected != null && p.progress < 100 && (
          <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-white" style={{ left: `calc(${p.expected}% - 1px)` }} />
        )}
      </div>

      {/* one segment per phase: width = weight, fill = progress */}
      <div>
        <div className="flex h-5 gap-0.5">
          {p.phases.map((ph) => (
            <div
              key={ph.id}
              className={cn(
                "relative overflow-hidden rounded bg-white/15",
                ph.id === p.current_phase_id && "ring-2 ring-inset ring-white",
              )}
              style={{ flex: ph.weight }}
              title={`${ph.code ?? ""} ${ph.name}: ${pct(ph.progress)}`}
            >
              <div className="absolute inset-y-0 left-0 bg-progress/90" style={{ width: `${ph.progress}%` }} />
              {(ph.health === "overdue" || ph.health === "at_risk") && ph.progress < 100 && (
                <span
                  className={cn("absolute right-1 top-1 size-1.5 rounded-full", ph.health === "overdue" ? "bg-critical" : "bg-warning")}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-sm">
          <span className="truncate">
            {current ? (
              <>
                Now: <b>{current.code ? `${current.code} ` : ""}{current.name}</b> · {pct(current.progress)}
                {current.milestones_total > 0 && (
                  <span className="text-white/60"> · {current.milestones_done}/{current.milestones_total} milestones</span>
                )}
              </>
            ) : (
              "All phases complete"
            )}
          </span>
          <span className="shrink-0 text-white/60">
            {p.phases.filter((ph) => ph.progress >= 100).length}/{p.phases.length} phases
          </span>
        </div>
      </div>

      {p.blocker ? (
        <div className="flex items-start gap-2 rounded-lg bg-[#fab219]/15 px-3 py-2 text-sm text-[#ffe2a3]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span className="line-clamp-2">{p.blocker}</span>
        </div>
      ) : p.next_milestones.length > 0 ? (
        <div className="truncate text-sm text-white/70">Next: {p.next_milestones.map((m) => m.title).join(" · ")}</div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-sm text-white/70">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-4" /> Due {fmtDate(p.due_date)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileStack className="size-4" /> {issued}/{p.drawings.total} drawings issued
        </span>
        <span className={cn("font-semibold", late ? "text-[#ff9b9b]" : "text-white")}>
          {p.days_left == null ? "No deadline" : late ? `${-p.days_left} days late` : `${p.days_left} days left`}
        </span>
      </div>
      <span className="sr-only">{active ? "Selected project" : ""}</span>
    </div>
  );
}
