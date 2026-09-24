/** The parts of Atelier's /api/dashboard response the Spotlight view uses. */

export type Health = "on_track" | "at_risk" | "overdue" | "done" | "not_started";

export type Phase = {
  id: number;
  code: string | null;
  name: string;
  weight: number;
  progress: number;
  expected: number | null;
  health: Health;
  planned_start: string | null;
  planned_end: string | null;
  assignee_name: string | null;
  milestones_total: number;
  milestones_done: number;
};

export type Project = {
  id: number;
  code: string;
  name: string;
  client: string | null;
  location: string | null;
  lead_name: string | null;
  status: "active" | "on_hold" | "completed" | string;
  due_date: string | null;
  days_left: number | null;
  progress: number;
  expected: number | null;
  delta_today: number;
  delta_week: number;
  health: Health;
  current_phase: string | null;
  current_phase_id: number | null;
  phases: Phase[];
  blocker: string | null;
  mail_waiting: number;
  needs_attention: boolean;
  next_milestones: { id: number; title: string; due_date: string | null }[];
  drawings: { total: number; overdue: number; by_stage: Record<string, number> };
};

export type Dashboard = {
  office: string;
  generated_at: string;
  kpis: {
    active_projects: number;
    average_progress: number;
    moved_today: number;
    points_today: number;
    health: Record<Health, number>;
    drawings_open: number;
    drawings_in_review: number;
  };
  projects: Project[];
};

export type User = { id: number | null; name: string; access: string; display: boolean };
