"use client";

import * as React from "react";

import type { Dashboard, User } from "./types";

// Every request carries this header: Atelier's server refuses changes without it (CSRF),
// and it's harmless on reads.
const HEADERS = { "X-Atelier": "1" };

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Dashboard; user: User; changed: Set<number> };

function fingerprint(p: Dashboard["projects"][number]) {
  return JSON.stringify([p.status, Math.round(p.progress), p.current_phase, p.health, p.blocker, p.mail_waiting,
    p.phases.map((ph) => Math.round(ph.progress))]);
}

/**
 * Loads the dashboard and keeps it current: the server announces every saved change
 * over /api/events, and we refetch right away. Projects that changed since the last
 * load are reported in `changed` so the UI can highlight them.
 */
export function useDashboard(): State & { live: boolean } {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [live, setLive] = React.useState(false);
  const snapshot = React.useRef(new Map<number, string>());

  const load = React.useCallback(async () => {
    try {
      const me = await fetch("/api/auth/me", { headers: HEADERS }).then((r) => r.json());
      if (!me.user) {
        setState({ status: "signed-out" });
        return;
      }
      const res = await fetch("/api/dashboard", { headers: HEADERS });
      if (res.status === 401) {
        setState({ status: "signed-out" });
        return;
      }
      if (!res.ok) throw new Error(`The server answered ${res.status}`);
      const data: Dashboard = await res.json();
      const changed = new Set<number>();
      const first = snapshot.current.size === 0;
      for (const p of data.projects) {
        const fp = fingerprint(p);
        if (!first && snapshot.current.get(p.id) !== fp) changed.add(p.id);
        snapshot.current.set(p.id, fp);
      }
      setState({ status: "ready", data, user: me.user, changed });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  React.useEffect(() => {
    const fallback = window.setInterval(load, 60_000); // in case the live connection is down
    let version: string | null = null;
    let timer: number | undefined;
    // The stream announces the current version as soon as it connects, so its first
    // message triggers the first load; every later change triggers a refresh.
    const events = new EventSource("/api/events");
    events.addEventListener("version", (e) => {
      setLive(true);
      const next = (e as MessageEvent).data as string;
      if (next !== version) {
        window.clearTimeout(timer);
        timer = window.setTimeout(load, version === null ? 0 : 300); // several saves in a row -> one refresh
      }
      version = next;
    });
    events.onerror = () => {
      setLive(false);
      if (version === null) load(); // not signed in, or no live connection: load once anyway
    };
    return () => {
      events.close();
      window.clearInterval(fallback);
      window.clearTimeout(timer);
    };
  }, [load]);

  return { ...state, live };
}
