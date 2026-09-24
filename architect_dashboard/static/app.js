/* Atelier Studio Board: front end (no build step). */
"use strict";

const state = {
  dashboard: null,
  meta: null,
  members: [],
  manageProjectId: null,
  timer: null,
  boardFilter: "all",
  gmail: { configured: false, accounts: [] },
  user: null,
  dragId: null,
};

// Avatar colours: one per team member, assigned by id in a fixed order (initials carry identity too)
const AVATAR = ["#1b2a4a", "#8b6914", "#166534", "#9a3412", "#1d4e89", "#57534e", "#6b3a7a", "#0f5e5e"];
const avatarColor = (id) => AVATAR[(id - 1) % AVATAR.length];
const initials = (name) => (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
function avatar(id, name) {
  return `<span class="av" style="background:${avatarColor(id)}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

const HEALTH = {
  overdue: { label: "Overdue", icon: "!" },
  at_risk: { label: "At risk", icon: "▲" },
  on_track: { label: "On track", icon: "✓" },
  done: { label: "Complete", icon: "✓" },
  not_started: { label: "Not started", icon: "–" },
};
const ATTENTION = ["overdue", "at_risk", "on_track", "not_started", "done"];
const STAGE_LABEL = {
  not_started: "Not started", draft: "Draft", in_progress: "In progress",
  review: "In review", approved: "Approved", issued: "Issued",
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v == null ? "–" : `${Math.round(v)}%`);
const fmtDate = (iso) => (iso ? new Date(iso.slice(0, 10) + "T00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "–");

function delta(v, suffix = "") {
  if (!v) return `<span class="delta-flat">±0${suffix}</span>`;
  const cls = v > 0 ? "delta-up" : "delta-down";
  return `<span class="${cls}">${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}${suffix}</span>`;
}

function badge(health) {
  const h = HEALTH[health] || HEALTH.not_started;
  return `<span class="badge ${esc(health)}"><span class="dot" aria-hidden="true">${h.icon}</span>${h.label}</span>`;
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)} min ago`;
  if (diff < 60 * 24) return `${Math.round(diff / 60)} h ago`;
  return fmtDate(iso);
}

async function api(path, options = {}) {
  const opts = { ...options, headers: { "X-Atelier": "1" } };  // server rejects changes without it (CSRF)
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    showAuth("login");
    throw new Error("Please sign in again");
  }
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(", ") : data.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2600);
}

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (_) { return null; }
}

// tooltip shared by all hover targets
const tip = {
  show(html, x, y) {
    const el = $("#tooltip");
    el.innerHTML = html;
    el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.min(window.innerWidth - w - 8, x + 12)}px`;
    el.style.top = `${Math.max(8, y - h - 12)}px`;
  },
  hide() { $("#tooltip").hidden = true; },
};
document.addEventListener("mouseover", (e) => {
  const t = e.target.closest("[data-tip]");
  if (t) tip.show(t.dataset.tip, e.clientX, e.clientY);
});
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest("[data-tip]");
  if (t) tip.show(t.dataset.tip, e.clientX, e.clientY);
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest("[data-tip]")) tip.hide();
});

// ---------------------------------------------------------------------------
// wall dashboard
// ---------------------------------------------------------------------------
async function loadDashboard() {
  try {
    state.dashboard = await api("/api/dashboard");
    renderWall();
    $("#last-refresh").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (err) {
    $("#last-refresh").textContent = `Offline — ${err.message}`;
  }
  clearTimeout(state.timer);
  const every = (state.dashboard?.refresh_seconds || 60) * 1000;
  state.timer = setTimeout(loadDashboard, every);
}

function renderWall() {
  const d = state.dashboard;
  $("#office-name").textContent = d.office;
  document.title = `Atelier · ${d.office}`;
  renderKpis(d.kpis);
  renderFilters(d.projects);
  renderProjects();
  renderMail(d.mail);
  renderAttention(d.projects);
  renderActivity(d.activity);
  renderTeam(d.team);
  renderBoard();
}

function waitingFor(iso) {
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  return hours < 24 ? `${Math.max(1, Math.round(hours))}h` : `${Math.round(hours / 24)}d`;
}

function renderMail(mail) {
  const root = $("#mail");
  if (!state.gmail.configured || !state.gmail.accounts.length) {
    root.innerHTML = `<li class="muted small" style="padding:4px 0">Connect Gmail under <a href="#data">Data &amp; sync</a> to see client and consultant emails waiting on a reply.</li>`;
    return;
  }
  const visible = mail.filter((m) => matchesSearch(state.dashboard.projects.find((p) => p.id === m.project_id) || {}));
  root.innerHTML = visible.length ? visible.map((m) => `<li><a href="${esc(m.url)}" target="_blank" rel="noopener">
      <div class="from">${esc(m.from_name)}</div>
      <div class="subj">${esc(m.subject)}</div>
      <div class="meta"><span class="code">${esc(m.project_code)}</span> · <span class="wait">waiting ${waitingFor(m.last_message_at)}</span> · in ${esc(m.mailbox_owner)}'s inbox</div>
    </a></li>`).join("") : `<li class="muted small" style="padding:4px 0">Inbox clear: nobody is waiting on a reply.</li>`;
}

function renderAttention(projects) {
  const items = projects.filter((p) => p.status === "active" && p.needs_attention)
    .sort((a, b) => ATTENTION.indexOf(a.health) - ATTENTION.indexOf(b.health));
  $("#attention").innerHTML = items.length ? items.map((p) => {
    const why = [];
    if (p.blocker) {
      why.push(`<div class="blocker">${esc(p.blocker)}</div>`);
      if (p.blocker_since) why.push(`<div class="why">Blocked since ${timeAgo(p.blocker_since)}</div>`);
    }
    if (p.mail_waiting) why.push(`<div class="why"><span class="mail-flag">✉ ${p.mail_waiting}</span> email${p.mail_waiting > 1 ? "s" : ""} waiting on a reply</div>`);
    if (p.health === "overdue" || p.health === "at_risk") {
      const late = p.phases.filter((ph) => ph.health === p.health).map((ph) => ph.name).join(", ");
      why.push(`<div class="why">${badge(p.health)} ${esc(late || (p.days_left < 0 ? "Past the deadline" : "Behind schedule"))}</div>`);
    }
    return `<li data-project="${p.id}" class="attention-item"><div class="what"><span class="code">${esc(p.code)}</span> <b>${esc(p.name)}</b></div>${why.join("")}</li>`;
  }).join("") : `<li class="muted">Nothing blocked or behind. 🎉</li>`;
}

function renderKpis(k) {
  const h = k.health;
  $("#kpis").innerHTML = `
    <div class="kpi"><div class="label">Active projects</div><div class="value">${k.active_projects}</div></div>
    <div class="kpi"><div class="label">Average progress</div><div class="value">${pct(k.average_progress)}</div></div>
    <div class="kpi"><div class="label">Moved today</div>
      <div class="value">${k.moved_today}<small class="muted"> / ${k.active_projects}</small></div>
      <div class="sub">${delta(k.points_today, " pts")} combined</div></div>
    <div class="kpi"><div class="label">Schedule</div>
      <div class="status-counts">
        <span>${badge("on_track")} <b>${h.on_track}</b></span>
        <span>${badge("at_risk")} <b>${h.at_risk}</b></span>
        <span>${badge("overdue")} <b>${h.overdue}</b></span>
      </div></div>
    <div class="kpi"><div class="label">Drawings open</div><div class="value">${k.drawings_open}</div>
      <div class="sub">${k.drawings_in_review} waiting for review</div></div>`;
}

function renderFilters(projects) {
  const select = $("#filter-lead");
  const current = select.value || storage("studio.#filter-lead") || "";
  const leads = [...new Set(projects.map((p) => p.lead_name).filter(Boolean))].sort();
  select.innerHTML = `<option value="">All architects</option>` +
    leads.map((l) => `<option ${l === current ? "selected" : ""}>${esc(l)}</option>`).join("");
}

function matchesSearch(p) {
  const q = $("#search").value.trim().toLowerCase();
  if (!q) return true;
  return [p.code, p.name, p.client, p.location, p.lead_name, p.current_phase]
    .some((v) => (v || "").toLowerCase().includes(q));
}

function visibleProjects() {
  const lead = $("#filter-lead").value;
  const health = $("#filter-health").value;
  const sort = $("#sort-by").value;
  const list = state.dashboard.projects.filter((p) =>
    p.status === "active" && matchesSearch(p) && (!lead || p.lead_name === lead) && (!health || p.health === health));
  const byDue = (a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999");
  const sorters = {
    attention: (a, b) => ATTENTION.indexOf(a.health) - ATTENTION.indexOf(b.health) || byDue(a, b),
    due: byDue,
    progress: (a, b) => b.progress - a.progress,
    today: (a, b) => b.delta_today - a.delta_today,
  };
  return list.sort(sorters[sort]);
}

function renderProjects() {
  const list = visibleProjects();
  const root = $("#projects");
  if (!list.length) {
    root.innerHTML = `<div class="empty">No active projects match. Add one under <a href="#manage">Update progress</a> or import an Excel file under <a href="#data">Data &amp; sync</a>.</div>`;
    return;
  }
  root.innerHTML = list.map(projectCard).join("");
}

function projectCard(p) {
  const current = p.phases.find((ph) => ph.progress < 100);
  const phaseSegs = p.phases.map((ph) => {
    const tipHtml = `<b>${esc(ph.code ? ph.code + " " : "")}${esc(ph.name)}</b><br>${pct(ph.progress)} done` +
      (ph.expected != null && ph.progress < 100 ? ` · plan ${pct(ph.expected)}` : "") +
      (ph.milestones_total ? `<br>${ph.milestones_done}/${ph.milestones_total} milestones` : "") +
      `<br>${HEALTH[ph.health].label}` +
      (ph.planned_end ? ` · ends ${fmtDate(ph.planned_end)}` : "") +
      (ph.assignee_name ? `<br>${esc(ph.assignee_name)}` : "");
    return `<div class="phase-seg ${ph === current ? "current" : ""} ${esc(ph.health)}" style="flex:${ph.weight}"
      data-tip="${esc(tipHtml)}"><div class="fill" style="width:${ph.progress}%"></div></div>`;
  }).join("");

  const days = p.days_left;
  const dueText = days == null ? "No deadline" : days < 0 ? `<b>${-days} days late</b>` : `<b>${days}</b> days left`;

  return `
  <article class="project" tabindex="0" data-project="${p.id}" aria-label="${esc(p.name)}">
    <div class="project-head">
      <div>
        <div class="project-code">${esc(p.code)}</div>
        <div class="project-name">${esc(p.name)}</div>
        <div class="project-meta">${esc([p.client, p.location].filter(Boolean).join(" · "))}${p.lead_name ? ` · <b>${esc(p.lead_name)}</b>` : ""}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">${p.mail_waiting ? `<span class="mail-flag" title="${p.mail_waiting} email(s) waiting on a reply">✉ ${p.mail_waiting}</span>` : ""}${badge(p.health)}</div>
    </div>
    ${p.blocker ? `<div class="blocker">${esc(p.blocker)}</div>` : ""}
    <div class="progress-row">
      <div class="progress-big">${Math.round(p.progress)}<small>%</small></div>
      <div class="progress-notes">
        <span>${delta(p.delta_today, " today")} · ${delta(p.delta_week, " 7d")}</span>
        <span>${p.expected != null ? `Plan today ${pct(p.expected)}` : "No schedule set"}</span>
      </div>
    </div>
    <div class="bar" role="img" aria-label="Overall progress ${pct(p.progress)}${p.expected != null ? `, planned ${pct(p.expected)}` : ""}">
      <div class="bar-fill" style="width:${p.progress}%"></div>
      ${p.expected != null ? `<div class="bar-plan" style="left:calc(${p.expected}% - 1px)" data-tip="Where the schedule says the project should be today: <b>${pct(p.expected)}</b>"></div>` : ""}
    </div>
    <div>
      <div class="mini-label">Phases</div>
      <div class="phase-strip">${phaseSegs || '<span class="muted small">No phases yet</span>'}</div>
      <div class="phase-now" style="margin-top:6px">
        <span>${current ? `Now: <b>${esc(current.code ? current.code + " " : "")}${esc(current.name)}</b> · ${pct(current.progress)}` : "All phases complete"}</span>
        <span class="muted">${p.phases.filter((ph) => ph.progress >= 100).length}/${p.phases.length} done</span>
      </div>
      ${p.next_milestones.length ? `<div class="small muted" style="margin-top:4px">Next: ${p.next_milestones.map((m) => esc(m.title)).join(" · ")}</div>` : ""}
    </div>
    <div class="project-foot">
      <div>
        <div class="mini-label">Last 14 days</div>
        ${sparkline(p.history)}
      </div>
      <div>
        <div class="mini-label">Drawings</div>
        ${stageBar(p.drawings)}
      </div>
    </div>
    <div class="due"><span>Due ${fmtDate(p.due_date)}</span><span>${dueText}</span></div>
  </article>`;
}

function sparkline(history) {
  if (!history?.length) return "";
  const w = 160, h = 40, pad = 3;
  const values = history.map((d) => d.progress);
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(max - min, 2);
  const x = (i) => pad + (i / (history.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = history.map((d, i) => `${x(i).toFixed(1)},${y(d.progress).toFixed(1)}`);
  const hits = history.map((d, i) => {
    const prev = i ? d.progress - history[i - 1].progress : 0;
    const label = `<b>${fmtDate(d.date)}</b><br>${d.progress.toFixed(1)}%` + (i ? ` (${prev >= 0 ? "+" : ""}${prev.toFixed(1)})` : "");
    return `<rect x="${(x(i) - w / history.length / 2).toFixed(1)}" y="0" width="${(w / history.length).toFixed(1)}" height="${h}"
      fill="transparent" data-tip="${esc(label)}" data-i="${i}" data-x="${x(i).toFixed(1)}" data-y="${y(d.progress).toFixed(1)}"></rect>`;
  }).join("");
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img"
      aria-label="Progress over the last 14 days: from ${pct(values[0])} to ${pct(values[values.length - 1])}">
    <path class="area" d="M${pts[0]} L${pts.join(" L")} L${x(history.length - 1)},${h} L${x(0)},${h} Z"></path>
    <polyline class="line" points="${pts.join(" ")}"></polyline>
    <line class="hover-line" x1="0" x2="0" y1="0" y2="${h}" visibility="hidden"></line>
    <circle class="hover-dot" r="4" visibility="hidden"></circle>
    ${hits}
  </svg>`;
}

// crosshair on sparklines
document.addEventListener("mouseover", (e) => {
  const r = e.target.closest(".sparkline rect");
  if (!r) return;
  const svg = r.ownerSVGElement;
  const dot = svg.querySelector(".hover-dot"), line = svg.querySelector(".hover-line");
  dot.setAttribute("cx", r.dataset.x); dot.setAttribute("cy", r.dataset.y);
  line.setAttribute("x1", r.dataset.x); line.setAttribute("x2", r.dataset.x);
  dot.setAttribute("visibility", "visible"); line.setAttribute("visibility", "visible");
});
document.addEventListener("mouseout", (e) => {
  const svg = e.target.closest(".sparkline");
  if (svg && !svg.contains(e.relatedTarget)) {
    svg.querySelector(".hover-dot").setAttribute("visibility", "hidden");
    svg.querySelector(".hover-line").setAttribute("visibility", "hidden");
  }
});

function stageBar(stats) {
  if (!stats.total) return `<div class="muted small">No drawings yet</div>`;
  const order = ["draft", "in_progress", "review", "approved", "issued"];
  const segs = [`<span style="flex:${stats.by_stage.not_started};background:var(--track)" data-tip="Not started: <b>${stats.by_stage.not_started}</b>"></span>`]
    .concat(order.map((s) => `<span style="flex:${stats.by_stage[s]};background:var(--stage-${s})" data-tip="${STAGE_LABEL[s]}: <b>${stats.by_stage[s]}</b>"></span>`))
    .join("");
  const late = stats.overdue ? ` · <span class="delta-down">${stats.overdue} late</span>` : "";
  return `<div class="stage-bar" role="img" aria-label="${stats.by_stage.issued} of ${stats.total} drawings issued">${segs}</div>
    <div class="stage-legend">${stats.total} total · <b>${stats.by_stage.issued}</b> issued · ${stats.by_stage.review} in review${late}</div>`;
}

function renderActivity(items) {
  const root = $("#activity");
  if (!items.length) { root.innerHTML = `<li class="muted">No updates yet.</li>`; return; }
  root.innerHTML = items.map((a) => {
    const target = a.phase_name ? `${esc(a.phase_name)}` : `${esc(a.drawing_number)} ${esc(a.drawing_title || "")}`;
    return `<li>
      <div class="what"><b>${esc(a.project_code)}</b> ${target} → <b>${pct(a.progress)}</b></div>
      ${a.note ? `<div class="note">“${esc(a.note)}”</div>` : ""}
      <div class="when">${esc(a.member_name || (a.source === "gdrive" ? "Google Drive sync" : a.source === "excel" ? "Excel import" : a.source === "seed" ? "Demo data" : "—"))} · ${timeAgo(a.logged_at)}</div>
    </li>`;
  }).join("");
}

function renderTeam(team) {
  const members = team;
  const max = Math.max(1, ...members.map((m) => m.open_phases + m.open_drawings));
  $("#team").innerHTML = members.length ? members.map((m) => `
    <div class="member-row">
      <span class="name">${avatar(m.id, m.name)} ${esc(m.name)}</span>
      <span class="counts">${m.open_phases} phases · ${m.open_drawings} dwg${m.leading ? ` · leads ${m.leading}` : ""}</span>
      ${m.status ? `<span class="status">${esc(m.status)}</span>` : ""}
      <div class="bar" data-tip="<b>${esc(m.name)}</b><br>${m.open_phases} open phases, ${m.open_drawings} open drawings<br>Last update: ${m.last_update ? timeAgo(m.last_update) : "never"}">
        <div class="bar-fill" style="width:${((m.open_phases + m.open_drawings) / max) * 100}%"></div>
      </div>
    </div>`).join("") : `<p class="muted small">Add your team under Data &amp; sync.</p>`;
}

// ---------------------------------------------------------------------------
// board: one column per phase, drag a card to move the project
// ---------------------------------------------------------------------------
function boardProjects() {
  const person = $("#board-person").value;
  return state.dashboard.projects.filter((p) => {
    if (p.status !== "active" || !matchesSearch(p)) return false;
    if (state.boardFilter === "attention" && !p.needs_attention) return false;
    if (person && !p.team_ids.includes(Number(person))) return false;
    return true;
  });
}

function renderBoard() {
  if (!state.dashboard) return;
  const personSel = $("#board-person");
  const chosen = personSel.value;
  personSel.innerHTML = `<option value="">Everyone</option>` + state.dashboard.team.map((m) =>
    `<option value="${m.id}" ${String(m.id) === chosen ? "selected" : ""}>${esc(m.name)}</option>`).join("");

  const list = boardProjects();
  $("#board").innerHTML = state.dashboard.board.map((col) => {
    const cards = list.filter((p) => (col.name === null ? p.current_phase === null : p.current_phase === col.name));
    const key = col.name === null ? "" : col.name;
    return `<section class="col" aria-label="${esc(col.label || col.name)}">
      <div class="col-h"><span>${col.code && col.name ? `<span class="code">${esc(col.code)}</span> ` : ""}${esc(col.label || col.name)}</span><span class="count">${cards.length}</span></div>
      <div class="col-body" data-phase="${esc(key)}" data-complete="${col.name === null}">${cards.map(boardCard).join("")}</div>
    </section>`;
  }).join("");
}

function boardCard(p) {
  const team = p.team_ids.map((id) => state.dashboard.team.find((m) => m.id === id)).filter(Boolean);
  const cur = p.phases.find((ph) => ph.id === p.current_phase_id);
  return `<article class="bcard" draggable="${canEdit()}" tabindex="0" data-project="${p.id}" aria-label="${esc(p.name)}, ${pct(p.progress)}">
    <div class="top"><h4>${esc(p.name)}</h4><span class="gold-chip">${esc(p.code)}</span></div>
    <div class="client">${esc(p.client || "")}</div>
    <div class="pct"><b>${Math.round(p.progress)}%</b><div class="bar"><div class="bar-fill" style="width:${p.progress}%"></div></div></div>
    ${cur && cur.milestones_total ? `<div class="next">${cur.milestones_done}/${cur.milestones_total} milestones${p.next_milestones[0] ? ` · next: ${esc(p.next_milestones[0].title)}` : ""}</div>` : ""}
    ${p.blocker ? `<div class="blocker">${esc(p.blocker)}</div>` : ""}
    <div class="foot">
      <div class="avatars">${team.slice(0, 4).map((m) => avatar(m.id, m.name)).join("")}${team.length > 4 ? `<span class="more">+${team.length - 4}</span>` : ""}</div>
      <div class="flags">${p.mail_waiting ? `<span class="mail-flag" title="${p.mail_waiting} email(s) waiting on a reply">✉ ${p.mail_waiting}</span>` : ""}${p.health === "overdue" || p.health === "at_risk" ? badge(p.health) : ""}</div>
    </div>
  </article>`;
}

document.addEventListener("dragstart", (e) => {
  const card = e.target.closest?.(".bcard");
  if (!card) return;
  state.dragId = Number(card.dataset.project);
  card.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", card.dataset.project);
});
document.addEventListener("dragend", (e) => e.target.closest?.(".bcard")?.classList.remove("dragging"));
document.addEventListener("dragover", (e) => {
  const col = e.target.closest?.(".col-body");
  if (!col || state.dragId == null) return;
  e.preventDefault();
  document.querySelectorAll(".col-body.over").forEach((c) => c !== col && c.classList.remove("over"));
  col.classList.add("over");
});
document.addEventListener("dragleave", (e) => {
  const col = e.target.closest?.(".col-body");
  if (col && !col.contains(e.relatedTarget)) col.classList.remove("over");
});
document.addEventListener("drop", (e) => {
  const col = e.target.closest?.(".col-body");
  if (!col || state.dragId == null) return;
  e.preventDefault();
  col.classList.remove("over");
  const project = state.dashboard.projects.find((p) => p.id === state.dragId);
  state.dragId = null;
  const complete = col.dataset.complete === "true";
  const phaseName = complete ? null : col.dataset.phase;
  if (!project || project.current_phase === phaseName) return;
  if (!complete && !project.phases.some((ph) => ph.name === phaseName)) {
    toast(`${project.code} has no “${phaseName}” phase`);
    return;
  }
  confirmMove(project, phaseName);
});

function openModal(html) {
  $("#modal-body").innerHTML = html;
  const m = $("#modal");
  if (!m.open) m.showModal();
}

async function confirmMove(project, phaseName) {
  const detail = await api(`/api/projects/${project.id}`);
  const notify = detail.contacts.filter((c) => c.notify && c.email);
  const from = project.current_phase || "Complete";
  const to = phaseName || "Complete";
  const target = project.phases.find((ph) => ph.name === phaseName);
  const backwards = target && project.current_phase_id &&
    target.position < project.phases.find((ph) => ph.id === project.current_phase_id).position;
  openModal(`
    <div class="dialog-head"><div>
      <div class="project-code">${esc(project.code)} · ${esc(project.name)}</div>
      <h2 id="modal-title">Move to ${esc(to)}?</h2></div>
      <button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <div class="dialog-content">
      <p>From <b>${esc(from)}</b>. ${phaseName
        ? `Earlier phases are marked complete${backwards ? "; this phase and later ones are reopened" : ""}.`
        : "All phases are marked complete."}</p>
      <p>${phaseName
        ? (notify.length
          ? `${notify.length} contact${notify.length > 1 ? "s are" : " is"} marked <b>notify on phase change</b>: ${notify.map((c) => esc(c.name)).join(", ")}.`
          : "No contact is marked to be notified on phase change.")
        : ""}</p>
      <div class="actions">
        <button class="btn" data-close-modal>Cancel</button>
        ${phaseName && notify.length ? `<button class="btn" data-do-move="${esc(phaseName)}" data-email="0">Move, don't email</button>
          <button class="btn primary" data-do-move="${esc(phaseName)}" data-email="1">${myGmail() ? "Move + Gmail draft" : "Move + email draft"}</button>`
        : `<button class="btn primary" data-do-move="${esc(phaseName ?? "")}" data-complete="${phaseName === null}" data-email="0">Move</button>`}
      </div>
    </div>`);
  state.moveProject = project;
}

async function doMove(btn) {
  const project = state.moveProject;
  const phaseName = btn.dataset.complete === "true" ? null : btn.dataset.doMove;
  btn.disabled = true;
  try {
    const res = await api(`/api/projects/${project.id}/move`, {
      method: "POST",
      body: {
        phase_name: phaseName,
        create_draft: btn.dataset.email === "1" && Boolean(myGmail()),
      },
    });
    await loadDashboard();
    if (btn.dataset.email === "1" && res.email) {
      showDraft(project, res.email);
    } else {
      $("#modal").close();
      toast(`${project.code} moved to ${phaseName || "Complete"}`);
    }
  } catch (err) {
    toast(err.message);
    btn.disabled = false;
  }
}

function myGmail() {
  return state.gmail.accounts.find((a) => a.member_id === me()) || null;
}

function showDraft(project, email) {
  const saved = email.gmail_draft;
  openModal(`
    <div class="dialog-head"><div>
      <div class="project-code">${esc(project.code)} moved ✓</div>
      <h2 id="modal-title">${saved ? "Draft saved in Gmail" : "Email draft"}</h2></div>
      <button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <div class="dialog-content">
      <p>${saved
        ? `It's in the Drafts folder of <b>${esc(saved.mailbox)}</b>. Nothing has been sent: open it, check it and press send.`
        : "Nothing has been sent. Open the draft, check it, and send it yourself."}</p>
      ${email.draft_error ? `<p class="blocker">Couldn't save to Gmail: ${esc(email.draft_error)}</p>` : ""}
      <div class="draft">
        <div class="row"><b>To</b><span>${email.to.map((t) => `${esc(t.name)} &lt;${esc(t.email)}&gt;`).join(", ")}</span></div>
        <div class="row"><b>Subject</b><span>${esc(email.subject)}</span></div>
        <pre>${esc(email.body)}</pre>
      </div>
      <div class="actions">
        <button class="btn" data-copy-draft>Copy text</button>
        ${saved
          ? `<a class="btn primary" href="${esc(saved.url)}" target="_blank" rel="noopener">Open draft in Gmail</a>`
          : `<a class="btn" href="${esc(email.mailto_url)}">Open in mail app</a>
             <a class="btn primary" href="${esc(email.gmail_url)}" target="_blank" rel="noopener">Open in Gmail</a>`}
      </div>
    </div>`);
  state.draft = email;
}

// project details dialog
async function openProject(id, tab = "overview") {
  const dialog = $("#project-dialog");
  if (!dialog.open) {
    $("#dialog-body").innerHTML = `<div class="dialog-content muted">Loading…</div>`;
    dialog.showModal();
  }
  const p = await api(`/api/projects/${id}`);
  state.openProject = p;
  const waiting = p.mail.filter((m) => m.awaiting_reply).length;
  const tabs = [["overview", "Overview"], ["milestones", `Milestones`], ["people", `People (${p.contacts.length})`],
    ["mail", `Mail${waiting ? ` (${waiting} waiting)` : ""}`],
    ["drawings", `Drawings (${p.drawing_list.length})`], ["drive", "Drive"]];
  $("#dialog-body").innerHTML = `
    <div class="dialog-head">
      <div>
        <div class="project-code">${esc(p.code)}${p.client ? ` · ${esc(p.client)}` : ""}</div>
        <h2 id="dialog-title" style="font-size:22px">${esc(p.name)}</h2>
        <div class="project-meta">${esc([p.location, p.lead_name && "lead " + p.lead_name, p.current_phase].filter(Boolean).join(" · "))}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">${badge(p.health)}
        <button class="btn small needs-member" data-edit="${p.id}">Edit</button>
        <button class="icon-btn" data-close aria-label="Close">✕</button></div>
    </div>
    <div class="dtabs" role="tablist">${tabs.map(([k, label]) =>
      `<button class="dtab ${k === tab ? "on" : ""}" role="tab" aria-selected="${k === tab}" data-dtab="${k}">${label}</button>`).join("")}</div>
    <div class="dialog-content">
      <div data-pane="overview" ${tab === "overview" ? "" : "hidden"}>${overviewPane(p)}</div>
      <div data-pane="milestones" ${tab === "milestones" ? "" : "hidden"}>${milestonesPane(p)}</div>
      <div data-pane="people" ${tab === "people" ? "" : "hidden"}>${peoplePane(p)}</div>
      <div data-pane="mail" ${tab === "mail" ? "" : "hidden"}>${mailPane(p)}</div>
      <div data-pane="drawings" ${tab === "drawings" ? "" : "hidden"}>${drawingsPane(p)}</div>
      <div data-pane="drive" ${tab === "drive" ? "" : "hidden"}><div id="drive-files" class="muted small">Loading…</div></div>
    </div>`;
  api(`/api/projects/${id}/drive-files`).then((res) => {
    const el = $("#drive-files");
    if (!el) return;
    el.innerHTML = res.files.length
      ? `<ul class="files">${res.files.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${f.is_folder ? "📁 " : ""}${esc(f.name)}</a>
          <span class="muted">${esc(f.modified_by || "")} · ${f.modified ? timeAgo(f.modified) : ""}</span></li>`).join("")}</ul>`
      : esc(res.message || "Folder is empty.");
  }).catch((err) => { const el = $("#drive-files"); if (el) el.textContent = err.message; });
}

function overviewPane(p) {
  return `
    <form class="inline-form needs-member" data-blocker-form style="margin-bottom:14px">
      <input name="blocker" value="${esc(p.blocker || "")}" placeholder="Blocked by… (e.g. waiting on structural calcs)" style="flex:1;min-width:220px">
      <button class="btn" type="submit">${p.blocker ? "Update blocker" : "Set blocker"}</button>
      ${p.blocker ? `<button class="btn" type="button" data-clear-blocker>Resolved</button>` : ""}
    </form>
    <h3>Phases: overall ${pct(p.progress)}${p.expected != null ? ` (plan ${pct(p.expected)})` : ""}</h3>
    <div class="table-wrap"><table class="edit-table">
      <thead><tr><th>Phase</th><th>Responsible</th><th>Planned</th><th>Weight</th><th>Progress</th><th>Status</th></tr></thead>
      <tbody>${p.phases.map((ph) => `<tr>
        <td>${esc(ph.code || "")} ${esc(ph.name)}${ph.milestones_total ? ` <span class="muted small">· ${ph.milestones_done}/${ph.milestones_total}</span>` : ""}</td>
        <td>${esc(ph.assignee_name || "–")}</td>
        <td class="num">${ph.planned_start ? fmtDate(ph.planned_start) + " – " + fmtDate(ph.planned_end) : "–"}</td>
        <td class="num">${ph.weight}</td>
        <td><div class="progress-cell"><div class="bar" style="flex:1"><div class="bar-fill" style="width:${ph.progress}%"></div>
          ${ph.expected != null && ph.progress < 100 ? `<div class="bar-plan" style="left:calc(${ph.expected}% - 1px)"></div>` : ""}</div>
          <span class="num">${pct(ph.progress)}</span></div></td>
        <td>${badge(ph.health)}</td></tr>`).join("")}</tbody>
    </table></div>`;
}

function milestonesPane(p) {
  if (!p.phases.length) return `<p class="muted">Add phases first.</p>`;
  return `<p class="muted small" style="margin-top:0">Ticking a milestone updates the phase % on the dashboard and the board.</p>` +
    p.phases.map((ph) => {
      const items = p.milestones.filter((m) => m.phase_id === ph.id);
      const isCurrent = ph.id === p.current_phase_id;
      if (!items.length && !isCurrent && ph.progress >= 100) return "";
      return `<div class="ms-phase ${isCurrent ? "current" : ""}">
        <h4><span>${esc(ph.code || "")} ${esc(ph.name)} <span class="muted" style="font-weight:400">${pct(ph.progress)}</span></span></h4>
        ${items.map((m) => `<label class="ms ${m.done ? "done" : ""}">
          <input type="checkbox" data-milestone="${m.id}" ${m.done ? "checked" : ""} ${canEdit() ? "" : "disabled"}> <span>${esc(m.title)}</span>
          ${m.due_date ? `<span class="due">${fmtDate(m.due_date)}</span>` : ""}
          <button type="button" class="btn small danger x needs-member" data-delete-milestone="${m.id}" aria-label="Remove milestone">✕</button>
        </label>`).join("")}
        <details class="add-ms needs-member" ${isCurrent && !items.length ? "open" : ""}><summary>+ Add milestone</summary>
        <form class="inline-form" data-add-milestone="${ph.id}">
          <input name="title" placeholder="e.g. Outline spec" required style="flex:1;min-width:180px">
          <input type="date" name="due_date" aria-label="Due date">
          <button class="btn small" type="submit">Add</button>
        </form></details>
      </div>`;
    }).join("");
}

function peoplePane(p) {
  const kinds = state.meta.contact_kinds;
  const internal = [...new Set([p.lead_name, ...p.phases.map((ph) => ph.assignee_name)].filter(Boolean))];
  return `
    ${p.contacts.map((c) => `<div class="contact">
      <span class="av" style="background:${c.kind === "client" ? "var(--gold)" : "#1b2a4a"};margin:0">${esc(initials(c.name))}</span>
      <div class="who"><b>${esc(c.name)}</b><small>${[c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`, c.phone && esc(c.phone)].filter(Boolean).join(" · ")}</small></div>
      <span class="chip ${c.kind === "client" ? "client" : ""}">${esc(c.kind)}${c.role ? ` · ${esc(c.role)}` : ""}</span>
      <label class="notify-toggle"><input type="checkbox" data-notify="${c.id}" ${c.notify ? "checked" : ""} ${canEdit() ? "" : "disabled"}> notify on phase change</label>
      <button class="btn small danger needs-member" data-delete-contact="${c.id}" aria-label="Remove contact">✕</button>
    </div>`).join("") || `<p class="muted">No contacts yet.</p>`}
    <form class="form-grid needs-member" data-add-contact style="margin-top:14px">
      <label>Name <input name="name" required></label>
      <label>Email <input name="email" type="email"></label>
      <label>Type <select name="kind">${kinds.map((k) => `<option>${k}</option>`).join("")}</select></label>
      <label>Role <input name="role" placeholder="Owner, Structural…"></label>
      <label class="notify-toggle span-2"><input type="checkbox" name="notify"> Email a draft to them when the phase changes</label>
      <div class="span-2 actions" style="margin:0;justify-content:flex-end"><button class="btn primary" type="submit">Add contact</button></div>
    </form>
    <p class="muted small" style="margin-top:14px">Internal: ${internal.map(esc).join(", ") || "–"}</p>`;
}

function mailPane(p) {
  if (!state.gmail.accounts.length) {
    return `<p class="muted">Connect Gmail under <a href="#data">Data &amp; sync</a> to see this project's emails here.</p>`;
  }
  if (!p.mail.length) {
    return `<p class="muted">No emails with this project's contacts in the last few weeks.
      Threads show up here when a contact under People has an email address.</p>`;
  }
  return p.mail.map((m) => `<div class="thread">
      <a href="${esc(m.url)}" target="_blank" rel="noopener"><b>${esc(m.subject)}</b>
        <small>${esc(m.from_name)} · ${m.message_count} message${m.message_count > 1 ? "s" : ""} · in ${esc(m.mailbox_owner)}'s inbox</small></a>
      <span class="state">${m.awaiting_reply
        ? `<span class="mail-flag">waiting ${waitingFor(m.last_message_at)}</span>`
        : `<span class="muted">answered · ${timeAgo(m.last_message_at)}</span>`}</span>
    </div>`).join("");
}

function drawingsPane(p) {
  return `<div class="table-wrap"><table class="edit-table">
    <thead><tr><th>No.</th><th>Title</th><th>Phase</th><th>Scale</th><th>Rev</th><th>Stage</th><th>Responsible</th><th>Due</th></tr></thead>
    <tbody>${p.drawing_list.map((d) => `<tr>
      <td class="num">${esc(d.number)}</td><td>${esc(d.title || "")}</td><td>${esc(d.phase_name || "–")}</td>
      <td>${esc(d.scale || "")}</td><td>${esc(d.revision || "")}</td><td>${STAGE_LABEL[d.stage] || esc(d.stage)}</td>
      <td>${esc(d.assignee_name || "–")}</td><td class="num">${fmtDate(d.due_date)}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">No drawings.</td></tr>`}
    </tbody></table></div>`;
}

async function refreshOpenProject(tab) {
  await openProject(state.openProject.id, tab);
  loadDashboard();
}

// interactions inside the project dialog
document.addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.matches("[data-dtab]")) {
      document.querySelectorAll("[data-dtab]").forEach((b) => { b.classList.toggle("on", b === t); b.setAttribute("aria-selected", b === t); });
      document.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.dtab; });
    } else if (t.matches("[data-delete-milestone]")) {
      e.preventDefault();
      await api(`/api/milestones/${t.dataset.deleteMilestone}`, { method: "DELETE" });
      await refreshOpenProject("milestones");
    } else if (t.matches("[data-delete-contact]")) {
      if (!confirm("Remove this contact?")) return;
      await api(`/api/contacts/${t.dataset.deleteContact}`, { method: "DELETE" });
      await refreshOpenProject("people");
    } else if (t.matches("[data-clear-blocker]")) {
      await api(`/api/projects/${state.openProject.id}`, { method: "PATCH", body: { blocker: "" } });
      toast("Blocker resolved");
      await refreshOpenProject("overview");
    } else if (t.matches("[data-close-modal]")) {
      $("#modal").close();
    } else if (t.matches("[data-do-move]")) {
      await doMove(t);
    } else if (t.matches("[data-copy-draft]")) {
      const d = state.draft;
      await navigator.clipboard.writeText(`To: ${d.to.map((x) => x.email).join(", ")}\nSubject: ${d.subject}\n\n${d.body}`);
      toast("Draft copied");
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  try {
    if (t.matches("[data-milestone]")) {
      const res = await api(`/api/milestones/${t.dataset.milestone}`, {
        method: "PATCH", body: { done: t.checked },
      });
      toast(`Phase now ${pct(res.phase_progress)}`);
      await refreshOpenProject("milestones");
    } else if (t.matches("[data-notify]")) {
      await api(`/api/contacts/${t.dataset.notify}`, { method: "PATCH", body: { notify: t.checked } });
      toast(t.checked ? "Will be offered an email on phase change" : "Won't be emailed on phase change");
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener("click", (e) => {
  const card = e.target.closest(".project, .bcard, .attention-item");
  if (card) openProject(card.dataset.project);
  if (e.target.closest("[data-close]")) $("#project-dialog").close();
  const edit = e.target.closest("[data-edit]");
  if (edit) {
    $("#project-dialog").close();
    state.manageProjectId = Number(edit.dataset.edit);
    location.hash = "#manage";
  }
});
document.addEventListener("keydown", (e) => {
  const card = e.target.closest?.(".project, .bcard");
  if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openProject(card.dataset.project); }
});
$("#project-dialog").addEventListener("click", (e) => { if (e.target.id === "project-dialog") e.target.close(); });
$("#search").addEventListener("input", () => { if (state.dashboard) { renderProjects(); renderBoard(); renderMail(state.dashboard.mail); } });
$("#board-person").addEventListener("change", renderBoard);
document.querySelectorAll("[data-bfilter]").forEach((b) => b.addEventListener("click", () => {
  state.boardFilter = b.dataset.bfilter;
  document.querySelectorAll("[data-bfilter]").forEach((x) => x.classList.toggle("on", x === b));
  renderBoard();
}));
["#filter-lead", "#filter-health", "#sort-by"].forEach((sel) => $(sel).addEventListener("change", () => {
  storage(`studio.${sel}`, $(sel).value);
  renderProjects();
}));

// ---------------------------------------------------------------------------
// update progress view
// ---------------------------------------------------------------------------
function memberOptions(selected, blank = "—") {
  return `<option value="">${blank}</option>` + state.members.map((m) =>
    `<option value="${m.id}" ${m.id === selected ? "selected" : ""}>${esc(m.name)}</option>`).join("");
}

async function loadMembers() {
  state.members = await api("/api/members");
  document.querySelectorAll(".member-select").forEach((s) => { s.innerHTML = memberOptions(null); });
  fillMyStatus();
  renderMembers();
}

const ACCESS_LABEL = { "": "No login", viewer: "Viewer", member: "Team", admin: "Principal" };

function renderMembers() {
  $("#members").innerHTML = state.members.map((m) => {
    const access = m.access || "";
    const admin = isAdmin() ? `<span class="member-actions">
        <input class="access-select" data-member-email="${m.id}" type="email" value="${esc(m.email || "")}" placeholder="email" aria-label="Email for ${esc(m.name)}">
        <select class="access-select" data-member-access="${m.id}" aria-label="Access for ${esc(m.name)}">
          ${Object.entries(ACCESS_LABEL).map(([k, v]) => `<option value="${k}" ${k === access ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <button class="btn small" data-invite="${m.id}">${m.has_password ? "Reset link" : "Invite link"}</button>
      </span>` : `<span class="muted">${esc(ACCESS_LABEL[access])}</span>`;
    return `<li><span><b>${esc(m.name)}</b> <span class="muted">${esc(m.role || "")}</span>
      ${m.access && !m.has_password ? ` <span class="gold-chip">invited</span>` : ""}</span>${admin}</li>`;
  }).join("");
}

function showLink(el, title, url) {
  el.hidden = false;
  el.innerHTML = `<b>${esc(title)}</b>
    <div class="link-box"><input readonly value="${esc(url)}" aria-label="Link"><button class="btn small" data-copy="${esc(url)}">Copy</button></div>`;
  el.querySelector("input").select();
}

document.addEventListener("change", async (e) => {
  const t = e.target;
  try {
    if (t.matches("[data-member-access]")) {
      await api(`/api/members/${t.dataset.memberAccess}/access`, { method: "PUT", body: { access: t.value || null } });
      toast(`Access: ${ACCESS_LABEL[t.value]}`);
      await loadMembers();
    } else if (t.matches("[data-member-email]")) {
      await api(`/api/members/${t.dataset.memberEmail}`, { method: "PATCH", body: { email: t.value } });
      toast("Email saved");
      await loadMembers();
    }
  } catch (err) { toast(err.message); await loadMembers(); }
});

document.addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.matches("[data-invite]")) {
      const member = state.members.find((m) => m.id === Number(t.dataset.invite));
      const res = await api(`/api/members/${t.dataset.invite}/invite`, { method: "POST" });
      showLink($("#invite-result"), `Send this to ${member.name} (valid ${res.expires_in_days} days, works once):`, res.url);
      await loadMembers();
    } else if (t.matches("[data-copy]")) {
      await navigator.clipboard.writeText(t.dataset.copy);
      toast("Copied");
    } else if (t.matches("[data-revoke-display]")) {
      if (!confirm("Revoke this link? The screen using it will be signed out.")) return;
      await api(`/api/auth/display-links/${t.dataset.revokeDisplay}`, { method: "DELETE" });
      loadDisplayLinks();
    }
  } catch (err) { toast(err.message); }
});

async function loadDisplayLinks() {
  if (!isAdmin()) return;
  const links = await api("/api/auth/display-links");
  $("#display-links").innerHTML = links.map((l) => `<li><span><b>${esc(l.label)}</b><br>
      <span class="muted">${l.last_used_at ? `last seen ${timeAgo(l.last_used_at)}` : "not opened yet"} · by ${esc(l.created_by || "–")}</span></span>
      <button class="btn small danger" data-revoke-display="${l.id}">Revoke</button></li>`).join("") ||
    `<li class="muted">No wall displays yet.</li>`;
}

async function loadManage() {
  const projects = await api("/api/projects");
  const select = $("#m-project");
  if (!state.manageProjectId || !projects.some((p) => p.id === state.manageProjectId)) {
    state.manageProjectId = projects[0]?.id || null;
  }
  select.innerHTML = projects.map((p) =>
    `<option value="${p.id}" ${p.id === state.manageProjectId ? "selected" : ""}>${esc(p.code)} — ${esc(p.name)}</option>`).join("");
  if (!state.manageProjectId) {
    $("#m-project-card").innerHTML = `<p class="muted">No projects yet — create one with “+ New project”.</p>`;
    $("#m-phases").innerHTML = ""; $("#m-drawings").innerHTML = "";
    return;
  }
  const p = await api(`/api/projects/${state.manageProjectId}`);
  renderManageProject(p);
}

function renderManageProject(p) {
  const statuses = state.meta.project_statuses;
  $("#m-project-card").innerHTML = `
    <form id="project-form" class="form-grid">
      <h2 class="span-all">${esc(p.code)} — ${esc(p.name)} <span class="muted" style="font-weight:400">· overall ${pct(p.progress)}</span></h2>
      <label>Name <input name="name" value="${esc(p.name)}"></label>
      <label>Client <input name="client" value="${esc(p.client || "")}"></label>
      <label>Lead architect <select name="lead_id">${memberOptions(p.lead_id)}</select></label>
      <label>Status <select name="status">${statuses.map((s) => `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label class="span-all">Blocked by (leave empty when nothing is blocking) <input name="blocker" value="${esc(p.blocker || "")}" placeholder="e.g. Waiting on structural calcs"></label>
      <label>Start <input type="date" name="start_date" value="${esc(p.start_date || "")}"></label>
      <label>Due <input type="date" name="due_date" value="${esc(p.due_date || "")}"></label>
      <label class="span-2">Google Drive folder <input name="drive_folder_id" value="${esc(p.drive_folder_id || "")}" placeholder="Paste folder link"></label>
      <div class="span-all actions">
        <button class="btn primary" type="submit">Save project</button>
        ${p.phases.length ? "" : `<select id="apply-template">${Object.entries(state.meta.templates).map(([k, v]) => `<option value="${k}" ${k === state.meta.default_template ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
          <button class="btn" type="button" id="apply-template-btn">Add standard phases</button>`}
        <button class="btn danger needs-admin" type="button" id="delete-project">Delete project</button>
      </div>
    </form>`;

  $("#m-phases").innerHTML = `
    <thead><tr><th>Code</th><th>Phase</th><th>Responsible</th><th>Start</th><th>End</th><th>Weight</th><th>Progress</th><th>Note (optional)</th><th></th></tr></thead>
    <tbody>${p.phases.map((ph) => `<tr data-phase="${ph.id}">
      <td><input name="code" value="${esc(ph.code || "")}" size="4"></td>
      <td><input name="name" value="${esc(ph.name)}"></td>
      <td><select name="assignee_id">${memberOptions(ph.assignee_id)}</select></td>
      <td><input type="date" name="planned_start" value="${esc(ph.planned_start || "")}"></td>
      <td><input type="date" name="planned_end" value="${esc(ph.planned_end || "")}"></td>
      <td><input type="number" name="weight" min="0" step="0.5" value="${ph.weight}"></td>
      <td><div class="progress-cell"><input type="range" min="0" max="100" step="5" value="${ph.progress}" data-sync="progress">
        <input type="number" name="progress" min="0" max="100" value="${Math.round(ph.progress)}"></div></td>
      <td><input name="note" placeholder="What changed?"></td>
      <td><button class="btn small primary" data-save-phase>Save</button> <button class="btn small danger" data-delete-phase aria-label="Delete phase">✕</button></td>
    </tr>`).join("") || `<tr><td colspan="9" class="muted">No phases yet.</td></tr>`}</tbody>`;

  const stages = Object.keys(state.meta.drawing_stages);
  $("#m-drawings").innerHTML = `
    <thead><tr><th>No.</th><th>Title</th><th>Phase</th><th>Scale</th><th>Rev</th><th>Stage</th><th>Responsible</th><th>Due</th><th></th></tr></thead>
    <tbody>${p.drawing_list.map((d) => `<tr data-drawing="${d.id}">
      <td class="num"><b>${esc(d.number)}</b></td>
      <td><input name="title" value="${esc(d.title || "")}"></td>
      <td><select name="phase_id"><option value="">–</option>${p.phases.map((ph) => `<option value="${ph.id}" ${ph.id === d.phase_id ? "selected" : ""}>${esc(ph.code || ph.name)}</option>`).join("")}</select></td>
      <td><input name="scale" value="${esc(d.scale || "")}" size="5"></td>
      <td><input name="revision" value="${esc(d.revision || "")}" size="3"></td>
      <td><select name="stage">${stages.map((s) => `<option value="${s}" ${s === d.stage ? "selected" : ""}>${STAGE_LABEL[s]}</option>`).join("")}</select></td>
      <td><select name="assignee_id">${memberOptions(d.assignee_id)}</select></td>
      <td><input type="date" name="due_date" value="${esc(d.due_date || "")}"></td>
      <td><button class="btn small primary" data-save-drawing>Save</button> <button class="btn small danger" data-delete-drawing aria-label="Delete drawing">✕</button></td>
    </tr>`).join("") || `<tr><td colspan="9" class="muted">No drawings yet.</td></tr>`}</tbody>`;
}

function rowData(tr) {
  const data = {};
  tr.querySelectorAll("[name]").forEach((el) => {
    let v = el.value;
    if (el.type === "number" || /_id$/.test(el.name)) v = v === "" ? null : Number(v);
    else if (v === "") v = null;
    data[el.name] = v;
  });
  return data;
}

function me() { return state.user?.id || null; }
const canEdit = () => state.user && state.user.access !== "viewer";
const isAdmin = () => state.user?.access === "admin";

document.addEventListener("input", (e) => {
  const tr = e.target.closest(".edit-table tr");
  if (tr) tr.classList.add("dirty");
  if (e.target.dataset.sync === "progress") tr.querySelector('[name="progress"]').value = e.target.value;
  if (e.target.name === "progress" && tr) {
    const range = tr.querySelector('[data-sync="progress"]');
    if (range) range.value = e.target.value;
  }
});

document.addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.matches("[data-save-phase]")) {
      const tr = t.closest("tr");
      const data = rowData(tr);
      if (!data.note) delete data.note;
      await api(`/api/phases/${tr.dataset.phase}`, { method: "PATCH", body: data });
      toast("Phase saved"); await loadManage();
    } else if (t.matches("[data-delete-phase]")) {
      if (!confirm("Delete this phase and its history?")) return;
      await api(`/api/phases/${t.closest("tr").dataset.phase}`, { method: "DELETE" });
      toast("Phase deleted"); await loadManage();
    } else if (t.matches("[data-save-drawing]")) {
      const tr = t.closest("tr");
      await api(`/api/drawings/${tr.dataset.drawing}`, { method: "PATCH", body: rowData(tr) });
      toast("Drawing saved"); await loadManage();
    } else if (t.matches("[data-delete-drawing]")) {
      if (!confirm("Delete this drawing?")) return;
      await api(`/api/drawings/${t.closest("tr").dataset.drawing}`, { method: "DELETE" });
      toast("Drawing deleted"); await loadManage();
    } else if (t.id === "apply-template-btn") {
      await api(`/api/projects/${state.manageProjectId}`, { method: "PATCH", body: { template: $("#apply-template").value } });
      toast("Phases added"); await loadManage();
    } else if (t.id === "delete-project") {
      if (!confirm("Delete this project with all its phases, drawings and history?")) return;
      await api(`/api/projects/${state.manageProjectId}`, { method: "DELETE" });
      state.manageProjectId = null; toast("Project deleted"); await loadManage();
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener("submit", async (e) => {
  const form = e.target;
  const fields = Object.fromEntries(new FormData(form));
  for (const k of Object.keys(fields)) if (fields[k] === "") fields[k] = null;
  try {
    if (form.id === "project-form") {
      e.preventDefault();
      if (fields.lead_id) fields.lead_id = Number(fields.lead_id);
      await api(`/api/projects/${state.manageProjectId}`, { method: "PATCH", body: fields });
      toast("Project saved"); await loadManage();
    } else if (form.id === "new-project") {
      e.preventDefault();
      if (fields.lead_id) fields.lead_id = Number(fields.lead_id);
      const res = await api("/api/projects", { method: "POST", body: fields });
      state.manageProjectId = res.id;
      form.reset(); form.hidden = true;
      toast("Project created"); await loadManage();
    } else if (form.id === "add-phase") {
      e.preventDefault();
      await api(`/api/projects/${state.manageProjectId}/phases`, { method: "POST", body: fields });
      form.reset(); toast("Phase added"); await loadManage();
    } else if (form.id === "add-drawing") {
      e.preventDefault();
      await api(`/api/projects/${state.manageProjectId}/drawings`, { method: "POST", body: { ...fields, stage: "not_started" } });
      form.reset(); toast("Drawing added"); await loadManage();
    } else if (form.id === "add-display") {
      e.preventDefault();
      const res = await api("/api/auth/display-links", { method: "POST", body: fields });
      showLink($("#display-result"), "Open this once on the wall screen. It's shown only now:", res.url);
      form.reset(); loadDisplayLinks();
    } else if (form.id === "add-member") {
      e.preventDefault();
      await api("/api/members", { method: "POST", body: fields });
      form.reset(); toast("Team member added"); await loadMembers();
    } else if (form.id === "excel-upload") {
      e.preventDefault();
      $("#excel-result").textContent = "Importing…";
      const res = await api("/api/import/excel", { method: "POST", body: new FormData(form) });
      $("#excel-result").textContent = `Imported ${res.summary}` + (res.errors.length ? `\n${res.errors.join("\n")}` : "");
      form.reset(); await loadMembers();
    } else if (form.matches("[data-blocker-form]")) {
      e.preventDefault();
      await api(`/api/projects/${state.openProject.id}`, { method: "PATCH", body: { blocker: fields.blocker || "" } });
      toast(fields.blocker ? "Blocker saved" : "Blocker cleared");
      await refreshOpenProject("overview");
    } else if (form.matches("[data-add-milestone]")) {
      e.preventDefault();
      await api(`/api/phases/${form.dataset.addMilestone}/milestones`, { method: "POST", body: fields });
      await refreshOpenProject("milestones");
    } else if (form.matches("[data-add-contact]")) {
      e.preventDefault();
      await api(`/api/projects/${state.openProject.id}/contacts`, {
        method: "POST", body: { ...fields, notify: form.elements.notify.checked },
      });
      toast("Contact added");
      await refreshOpenProject("people");
    } else if (form.id === "my-status") {
      e.preventDefault();
      await api(`/api/members/${me()}`, { method: "PATCH", body: { status: fields.status || "" } });
      toast("Status updated"); await loadMembers();
    } else if (form.id === "gdrive-add") {
      e.preventDefault();
      await api("/api/gdrive/sources", { method: "POST", body: fields });
      form.reset(); toast("Spreadsheet added"); await loadSources();
    }
  } catch (err) {
    toast(err.message);
    if (form.id === "excel-upload") $("#excel-result").textContent = err.message;
  }
});

$("#m-project").addEventListener("change", (e) => { state.manageProjectId = Number(e.target.value); loadManage(); });
function fillMyStatus() {
  const m = state.members.find((x) => x.id === me());
  $("#m-status").value = m?.status || "";
}
$("#m-new-project-btn").addEventListener("click", () => { $("#new-project").hidden = false; $('#new-project [name="code"]').focus(); });
$("#cancel-new-project").addEventListener("click", () => { $("#new-project").hidden = true; });

// ---------------------------------------------------------------------------
// data & sync view
// ---------------------------------------------------------------------------
async function loadGmail() {
  state.gmail = await api("/api/gmail/status");
  return state.gmail;
}

// connection state for integrations (not a schedule status, so no status colours)
function connChip(ok, label) {
  return `<span class="chip ${ok ? "client" : ""}">${ok ? "● " : "○ "}${esc(label)}</span>`;
}

function renderGmail() {
  const g = state.gmail;
  $("#gmail-state").innerHTML = g.configured
    ? `${connChip(true, "Set up")} ${g.accounts.length} mailbox${g.accounts.length === 1 ? "" : "es"} connected.`
    : `${connChip(false, "Not set up")} The server needs ${g.missing.map((m) => `<code>${esc(m)}</code>`).join(", ")}
       (see README), and <code>${esc(g.redirect_uri)}</code> as an authorised redirect URI in Google Cloud.`;
  $("#gmail-connect-row").hidden = !g.configured;
  $("#gmail-sync").hidden = !g.accounts.length;
  $("#gmail-connect").textContent = myGmail() ? `Reconnect my Gmail (${myGmail().email})` : "Connect my Gmail";
  $("#gmail-accounts").innerHTML = g.accounts.map((a) => `<li>
      <span><b>${esc(a.member_name)}</b> · ${esc(a.email)}<br>
        <span class="muted">${a.last_synced_at ? `Synced ${timeAgo(a.last_synced_at)}: ${esc(a.last_result || "")}` : "Not synced yet"}</span></span>
      ${isAdmin() || a.member_id === me() ? `<button class="btn small danger" data-gmail-disconnect="${a.member_id}">Disconnect</button>` : ""}</li>`).join("");
}

$("#gmail-connect").addEventListener("click", () => {
  location.href = "/api/gmail/connect";
});
$("#gmail-sync").addEventListener("click", async () => {
  $("#gmail-result").textContent = "Checking mailboxes…";
  try {
    const res = await api("/api/gmail/sync", { method: "POST" });
    $("#gmail-result").textContent = res.results.join("\n");
  } catch (err) { $("#gmail-result").textContent = err.message; }
  await loadGmail(); renderGmail();
});
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-gmail-disconnect]");
  if (!btn || !confirm("Disconnect this Gmail account? Its threads disappear from Atelier.")) return;
  await api(`/api/gmail/accounts/${btn.dataset.gmailDisconnect}`, { method: "DELETE" });
  await loadGmail(); renderGmail();
  toast("Gmail disconnected");
});

async function loadSources() {
  await loadGmail().then(renderGmail).catch((err) => toast(err.message));
  loadDisplayLinks().catch((err) => toast(err.message));
  $("#gdrive-state").innerHTML = state.meta.gdrive_configured
    ? `${connChip(true, "Connected")} with a service account.`
    : `${connChip(false, "Not connected")} Set <code>GOOGLE_SERVICE_ACCOUNT_FILE</code> on the server (see README).`;
  const sources = await api("/api/gdrive/sources");
  $("#gdrive-sources").innerHTML = sources.map((s) => `<li>
      <span><b>${esc(s.name || s.file_id)}</b><br><span class="muted">${s.last_synced_at ? `${timeAgo(s.last_synced_at)} — ${esc(s.last_result)}` : "Not synced yet"}</span></span>
      <button class="btn small danger" data-remove-source="${s.id}">Remove</button></li>`).join("") ||
    `<li class="muted">No spreadsheets linked.</li>`;
}

$("#gdrive-sync").addEventListener("click", async () => {
  $("#gdrive-result").textContent = "Syncing…";
  try {
    const res = await api("/api/gdrive/sync", { method: "POST" });
    $("#gdrive-result").textContent = res.results.join("\n") || "No spreadsheets to sync.";
  } catch (err) { $("#gdrive-result").textContent = err.message; }
  loadSources();
});
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-remove-source]");
  if (!btn) return;
  await api(`/api/gdrive/sources/${btn.dataset.removeSource}`, { method: "DELETE" });
  loadSources();
});

// ---------------------------------------------------------------------------
// shell: routing, clock, theme, fullscreen
// ---------------------------------------------------------------------------
function route() {
  const view = (location.hash || "#wall").slice(1);
  let known = ["wall", "board", "manage", "data"].includes(view) ? view : "wall";
  if (!canEdit() && (known === "manage" || known === "data")) {
    known = "wall";
    history.replaceState(null, "", "/#wall");
  }
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== `view-${known}`; });
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === known));
  if (known === "wall" || known === "board") loadDashboard();
  if (known === "manage") loadManage().catch((err) => toast(err.message));
  if (known === "data") loadSources().catch((err) => toast(err.message));
}

function tick() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("#subtitle").textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
$("#theme-btn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  applyTheme(next); storage("studio.theme", next);
});
$("#fullscreen-btn").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

// ---------------------------------------------------------------------------
// sign-in
// ---------------------------------------------------------------------------
function showAuth(mode, info = {}) {
  clearTimeout(state.timer);
  document.body.className = "signed-out";
  $("#auth").hidden = false;
  $("#auth-error").textContent = "";
  ["login", "setup", "invite"].forEach((m) => { $(`#${m}-form`).hidden = m !== mode; });
  if (mode === "invite") {
    $("#invite-title").textContent = info.reset ? `New password, ${info.name.split(" ")[0]}` : `Welcome, ${info.name.split(" ")[0]}`;
    $("#invite-text").textContent = `You'll sign in as ${info.email}.`;
  }
  $(`#${mode}-form input`)?.focus();
}

function applyUser(user) {
  state.user = user;
  $("#auth").hidden = true;
  document.body.className = `role-${user.access}${user.display ? " is-display" : ""}`;
  $("#user-btn").textContent = user.display ? `🖥 ${user.name}` : user.name;
  $("#user-role").textContent = user.display ? "Wall display · read-only" : `${ACCESS_LABEL[user.access]}${user.email ? ` · ${user.email}` : ""}`;
  $("#sign-out").hidden = user.display;
  const view = (location.hash || "#wall").slice(1);
  if (!canEdit() && ["manage", "data"].includes(view)) location.hash = "#wall";
}

async function authSubmit(e, path, body) {
  e.preventDefault();
  $("#auth-error").textContent = "";
  try {
    await api(path, { method: "POST", body });
    history.replaceState(null, "", "/#wall");
    location.reload();
  } catch (err) { $("#auth-error").textContent = err.message; }
}

$("#login-form").addEventListener("submit", (e) => authSubmit(e, "/api/auth/login", Object.fromEntries(new FormData(e.target))));
$("#setup-form").addEventListener("submit", (e) => authSubmit(e, "/api/auth/setup", Object.fromEntries(new FormData(e.target))));
$("#invite-form").addEventListener("submit", (e) =>
  authSubmit(e, `/api/auth/invite/${encodeURIComponent(state.inviteToken)}`, Object.fromEntries(new FormData(e.target))));
$("#user-btn").addEventListener("click", () => {
  const pop = $("#user-pop");
  pop.hidden = !pop.hidden;
  $("#user-btn").setAttribute("aria-expanded", String(!pop.hidden));
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".user-menu")) $("#user-pop").hidden = true;
});
$("#sign-out").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/";
});
$("#password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/auth/password", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
    e.target.reset(); $("#user-pop").hidden = true;
    toast("Password changed");
  } catch (err) { toast(err.message); }
});

/** Returns true once someone is signed in; otherwise shows the right sign-in screen. */
async function authenticate() {
  const hash = location.hash;
  if (hash.startsWith("#invite=")) {
    state.inviteToken = decodeURIComponent(hash.slice("#invite=".length));
    history.replaceState(null, "", "/");  // keep the one-time token out of history and bookmarks
    try {
      const info = await api(`/api/auth/invite/${encodeURIComponent(state.inviteToken)}`);
      showAuth("invite", info);
    } catch (err) {
      showAuth("login");
      $("#auth-error").textContent = err.message;
    }
    return false;
  }
  const me = await api("/api/auth/me");
  $("#auth-office").textContent = me.office;
  if (me.user) { applyUser(me.user); return true; }
  showAuth(me.setup_needed ? "setup" : "login");
  if (new URLSearchParams(location.search).get("display") === "invalid") {
    $("#auth-error").textContent = "That display link is no longer valid. Ask the principal for a new one.";
  }
  return false;
}

async function init() {
  applyTheme(storage("studio.theme"));
  if (!(await authenticate())) return;
  ["#filter-lead", "#filter-health", "#sort-by"].forEach((sel) => {
    const saved = storage(`studio.${sel}`);
    if (saved != null) $(sel).value = saved;
  });
  tick(); setInterval(tick, 10000);
  state.meta = await api("/api/meta");
  $("#template-select").innerHTML = Object.entries(state.meta.templates).map(([k, v]) =>
    `<option value="${k}" ${k === state.meta.default_template ? "selected" : ""}>${esc(v)}</option>`).join("") +
    `<option value="none">No phases (add manually)</option>`;
  if (canEdit()) await loadMembers();
  await loadGmail().catch(() => {});
  const params = new URLSearchParams(location.search);
  if (params.has("gmail") || params.has("gmail_error")) {
    toast(params.get("gmail_error") || (params.get("gmail") === "connected" ? "Gmail connected ✓" : "Gmail connection cancelled"));
    history.replaceState(null, "", "/" + location.hash);
  }
  window.addEventListener("hashchange", route);
  route();
}

init().catch((err) => toast(err.message));
