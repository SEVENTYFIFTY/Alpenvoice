"use client";

import * as React from "react";
import { LayoutDashboard } from "lucide-react";

import { CardStack, type CardStackItem } from "@/components/ui/card-stack";
import { cn } from "@/lib/utils";

import { HEALTH, STATUS_LABEL, fmtDate, pct } from "./format";
import { ProjectCard } from "./project-card";
import type { Project } from "./types";
import { useDashboard } from "./use-dashboard";

type ProjectItem = CardStackItem & { project: Project };

const FILTERS = [
  { key: "all", label: "All projects" },
  { key: "attention", label: "Needs attention" },
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const ATTENTION = ["overdue", "at_risk", "on_track", "not_started", "done"];
const STATUS_ORDER = ["active", "on_hold", "completed"];

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** Cards as wide as the screen allows (up to 600px); taller when narrow so the content fits. */
function useCardSize() {
  const width = React.useSyncExternalStore(
    subscribeResize,
    () => Math.max(300, Math.min(600, window.innerWidth - 48)),
    () => 560, // while pre-rendering at build time
  );
  return { width, height: width < 480 ? 470 : 380 };
}

function subscribeClock(onChange: () => void) {
  const id = window.setInterval(onChange, 10_000);
  return () => window.clearInterval(id);
}

function useClock() {
  return React.useSyncExternalStore(
    subscribeClock,
    () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    () => "",
  );
}

export function Spotlight() {
  const dash = useDashboard();
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const size = useCardSize();
  const now = useClock();

  // outline projects that just changed, for a few seconds
  const changed = dash.status === "ready" ? dash.changed : null;
  const [faded, setFaded] = React.useState<Set<number> | null>(null);
  React.useEffect(() => {
    if (!changed || changed.size === 0) return;
    const id = window.setTimeout(() => setFaded(changed), 4000);
    return () => window.clearTimeout(id);
  }, [changed]);
  const highlight = changed && changed !== faded ? changed : new Set<number>();

  const items: ProjectItem[] = React.useMemo(() => {
    if (dash.status !== "ready") return [];
    return dash.data.projects
      .filter((p) =>
        filter === "all" ? true : filter === "attention" ? p.status === "active" && p.needs_attention : p.status === filter,
      )
      .sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
          ATTENTION.indexOf(a.health) - ATTENTION.indexOf(b.health) ||
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
      )
      .map((p) => ({
        id: p.id,
        title: `${p.code} ${p.name}`,
        description: [p.client, p.current_phase].filter(Boolean).join(" · "),
        tag: p.code,
        project: p,
      }));
  }, [dash, filter]);

  const active = items.find((i) => i.id === activeId)?.project ?? items[0]?.project;

  return (
    // overflow-x-clip: the fanned side cards reach past the screen edges; clip them there
    // instead of letting them widen the page
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-navy px-5 py-3 text-white">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-bold tracking-[0.14em]">ATELIER</span>
          <span className="text-sm text-white/70">
            {dash.status === "ready" ? dash.data.office : ""} · Spotlight
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-white/70">
            <span className={cn("size-2 rounded-full", dash.live ? "bg-good" : "bg-warning")} />
            {dash.live ? "Live" : "Connecting…"}
          </span>
          <span className="text-lg font-semibold tabular-nums">{now}</span>
          {/* A plain link on purpose: the main dashboard is outside this app, and next/link would add /spotlight. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-3 py-1 hover:bg-white/10"
          >
            <LayoutDashboard className="size-4" /> Dashboard
          </a>
        </div>
      </header>

      {dash.status === "loading" && <p className="p-8 text-muted-foreground">Loading projects…</p>}
      {dash.status === "error" && <p className="p-8 text-destructive">Couldn’t load the projects: {dash.message}</p>}
      {dash.status === "signed-out" && (
        <div className="m-auto max-w-sm rounded-2xl bg-card p-8 text-center shadow-lg">
          <h1 className="text-xl font-semibold">Sign in to see the projects</h1>
          <p className="mt-2 text-sm text-muted-foreground">Spotlight uses your Atelier account.</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- sign-in lives in the main app */}
          <a href="/" className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-primary-foreground">
            Go to sign-in
          </a>
        </div>
      )}

      {dash.status === "ready" && (
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 sm:px-6">
          <Summary projects={dash.data.projects} kpis={dash.data.kpis} />

          <div className="mt-5 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Which projects">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition",
                  filter === f.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="mt-16 text-center text-muted-foreground">No projects here.</p>
          ) : (
            <>
              <CardStack<ProjectItem>
                key={`${filter}-${size.width}`}
                className="mt-4"
                items={items}
                cardWidth={size.width}
                cardHeight={size.height}
                maxVisible={7}
                overlap={0.5}
                spreadDeg={36}
                autoAdvance
                intervalMs={7000}
                pauseOnHover
                showDots
                onChangeIndex={(_, item) => setActiveId(Number(item.id))}
                renderCard={(item, { active }) => (
                  <ProjectCard project={item.project} active={active} changed={highlight.has(item.project.id)} />
                )}
              />
              {active && <PhaseDetail project={active} />}
            </>
          )}
        </main>
      )}
    </div>
  );
}

function Summary({ projects, kpis }: { projects: Project[]; kpis: import("./types").Dashboard["kpis"] }) {
  const onHold = projects.filter((p) => p.status === "on_hold").length;
  const completed = projects.filter((p) => p.status === "completed").length;
  const tiles = [
    { label: "Active projects", value: String(kpis.active_projects), sub: [onHold && `${onHold} on hold`, completed && `${completed} completed`].filter(Boolean).join(" · ") },
    { label: "Average progress", value: pct(kpis.average_progress), sub: `${kpis.moved_today} moved today` },
    { label: "On track", value: String(kpis.health.on_track ?? 0), sub: `${kpis.health.at_risk ?? 0} at risk · ${kpis.health.overdue ?? 0} overdue` },
    { label: "Drawings open", value: String(kpis.drawings_open), sub: `${kpis.drawings_in_review} waiting for review` },
  ];
  return (
    <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Studio summary">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border bg-card px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{t.label}</div>
          <div className="text-3xl font-semibold">{t.value}</div>
          <div className="text-sm text-muted-foreground">{t.sub || " "}</div>
        </div>
      ))}
    </section>
  );
}

/** Every phase of the project in front: progress, plan, dates and who holds it. */
function PhaseDetail({ project: p }: { project: Project }) {
  return (
    <section className="mx-auto mt-8 max-w-3xl rounded-2xl border bg-card p-5" aria-label={`Phases of ${p.name}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <span className="font-mono text-sm text-gold">{p.code}</span> {p.name}
        </h2>
        <span className="text-sm text-muted-foreground">
          {STATUS_LABEL[p.status] ?? p.status} · overall {pct(p.progress)}
          {p.expected != null && p.progress < 100 ? ` · plan ${pct(p.expected)}` : ""}
        </span>
      </div>
      <ul className="divide-y">
        {p.phases.map((ph) => {
          const h = HEALTH[ph.health] ?? HEALTH.not_started;
          const current = ph.id === p.current_phase_id;
          return (
            <li key={ph.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className={cn("truncate text-sm", current && "font-semibold")}>
                  <span className="font-mono text-xs text-gold">{ph.code}</span> {ph.name}
                  {current && <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold">now</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {ph.planned_start ? `${fmtDate(ph.planned_start)} – ${fmtDate(ph.planned_end)}` : "No dates"}
                  {ph.assignee_name ? ` · ${ph.assignee_name}` : ""}
                </div>
              </div>
              <div className="relative order-3 col-span-2 h-2 rounded-full bg-secondary sm:order-none sm:col-span-1">
                <div className="h-full rounded-full bg-primary" style={{ width: `${ph.progress}%` }} />
                {ph.expected != null && ph.progress < 100 && ph.expected > 0 && (
                  <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-foreground" style={{ left: `calc(${ph.expected}% - 1px)` }} />
                )}
              </div>
              <div className="flex items-center gap-2 text-sm tabular-nums">
                <span className="w-10 text-right font-semibold">{pct(ph.progress)}</span>
                {ph.progress < 100 && (ph.health === "overdue" || ph.health === "at_risk") && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", h.className)}>
                    {h.icon} {h.label}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
