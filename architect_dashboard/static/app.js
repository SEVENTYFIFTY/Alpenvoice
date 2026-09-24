/* Studio Dashboard — front end (no build step). */
"use strict";

const state = {
  dashboard: null,
  meta: null,
  members: [],
  manageProjectId: null,
  timer: null,
};

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
  const opts = { ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
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
  document.title = `${d.office} — Dashboard`;
  renderKpis(d.kpis);
  renderFilters(d.projects);
  renderProjects();
  renderActivity(d.activity);
  renderTeam(d.team);
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

function visibleProjects() {
  const lead = $("#filter-lead").value;
  const health = $("#filter-health").value;
  const sort = $("#sort-by").value;
  const list = state.dashboard.projects.filter((p) =>
    p.status === "active" && (!lead || p.lead_name === lead) && (!health || p.health === health));
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
      ${badge(p.health)}
    </div>
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
  const members = team.filter((m) => m.open_phases || m.open_drawings || m.leading);
  const max = Math.max(1, ...members.map((m) => m.open_phases + m.open_drawings));
  $("#team").innerHTML = members.length ? members.map((m) => `
    <div class="member-row">
      <span class="name">${esc(m.name)}</span>
      <span class="counts">${m.open_phases} phases · ${m.open_drawings} dwg${m.leading ? ` · leads ${m.leading}` : ""}</span>
      <div class="bar" data-tip="<b>${esc(m.name)}</b><br>${m.open_phases} open phases, ${m.open_drawings} open drawings<br>Last update: ${m.last_update ? timeAgo(m.last_update) : "never"}">
        <div class="bar-fill" style="width:${((m.open_phases + m.open_drawings) / max) * 100}%"></div>
      </div>
    </div>`).join("") : `<p class="muted small">Assign phases and drawings to see workload.</p>`;
}

// project details dialog
async function openProject(id) {
  const dialog = $("#project-dialog");
  $("#dialog-body").innerHTML = `<div class="dialog-content muted">Loading…</div>`;
  dialog.showModal();
  const p = await api(`/api/projects/${id}`);
  $("#dialog-body").innerHTML = `
    <div class="dialog-head">
      <div>
        <div class="project-code">${esc(p.code)}</div>
        <h2 id="dialog-title" style="font-size:22px">${esc(p.name)}</h2>
        <div class="project-meta">${esc([p.client, p.location, p.lead_name].filter(Boolean).join(" · "))}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">${badge(p.health)}
        <button class="btn small" data-edit="${p.id}">Update</button>
        <button class="icon-btn" data-close aria-label="Close">✕</button></div>
    </div>
    <div class="dialog-content">
      <h3>Phases — overall ${pct(p.progress)}${p.expected != null ? ` (plan ${pct(p.expected)})` : ""}</h3>
      <div class="table-wrap"><table class="edit-table">
        <thead><tr><th>Phase</th><th>Responsible</th><th>Planned</th><th>Weight</th><th>Progress</th><th>Status</th></tr></thead>
        <tbody>${p.phases.map((ph) => `<tr>
          <td>${esc(ph.code || "")} ${esc(ph.name)}</td>
          <td>${esc(ph.assignee_name || "–")}</td>
          <td class="num">${ph.planned_start ? fmtDate(ph.planned_start) + " – " + fmtDate(ph.planned_end) : "–"}</td>
          <td class="num">${ph.weight}</td>
          <td><div class="progress-cell"><div class="bar" style="flex:1"><div class="bar-fill" style="width:${ph.progress}%"></div>
            ${ph.expected != null && ph.progress < 100 ? `<div class="bar-plan" style="left:calc(${ph.expected}% - 1px)"></div>` : ""}</div>
            <span class="num">${pct(ph.progress)}</span></div></td>
          <td>${badge(ph.health)}</td></tr>`).join("")}</tbody>
      </table></div>
      <h3>Drawings (${p.drawing_list.length})</h3>
      <div class="table-wrap"><table class="edit-table">
        <thead><tr><th>No.</th><th>Title</th><th>Phase</th><th>Scale</th><th>Rev</th><th>Stage</th><th>Responsible</th><th>Due</th></tr></thead>
        <tbody>${p.drawing_list.map((d) => `<tr>
          <td class="num">${esc(d.number)}</td><td>${esc(d.title || "")}</td><td>${esc(d.phase_name || "–")}</td>
          <td>${esc(d.scale || "")}</td><td>${esc(d.revision || "")}</td><td>${STAGE_LABEL[d.stage] || esc(d.stage)}</td>
          <td>${esc(d.assignee_name || "–")}</td><td class="num">${fmtDate(d.due_date)}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">No drawings.</td></tr>`}
        </tbody></table></div>
      <h3>Google Drive</h3>
      <div id="drive-files" class="muted small">Loading…</div>
    </div>`;
  api(`/api/projects/${id}/drive-files`).then((res) => {
    $("#drive-files").innerHTML = res.files.length
      ? `<ul class="files">${res.files.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${f.is_folder ? "📁 " : ""}${esc(f.name)}</a>
          <span class="muted">${esc(f.modified_by || "")} · ${f.modified ? timeAgo(f.modified) : ""}</span></li>`).join("")}</ul>`
      : esc(res.message || "Folder is empty.");
  }).catch((err) => { $("#drive-files").textContent = err.message; });
}

document.addEventListener("click", (e) => {
  const card = e.target.closest(".project");
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
  const card = e.target.closest?.(".project");
  if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openProject(card.dataset.project); }
});
$("#project-dialog").addEventListener("click", (e) => { if (e.target.id === "project-dialog") e.target.close(); });
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
  const me = $("#m-member");
  me.innerHTML = memberOptions(Number(storage("studio.me")) || null, "— select your name —");
  $("#members").innerHTML = state.members.map((m) =>
    `<li><span><b>${esc(m.name)}</b> ${esc(m.role || "")}</span><span class="muted">${esc(m.email || "")}</span></li>`).join("");
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
      <label>Start <input type="date" name="start_date" value="${esc(p.start_date || "")}"></label>
      <label>Due <input type="date" name="due_date" value="${esc(p.due_date || "")}"></label>
      <label class="span-2">Google Drive folder <input name="drive_folder_id" value="${esc(p.drive_folder_id || "")}" placeholder="Paste folder link"></label>
      <div class="span-all actions">
        <button class="btn primary" type="submit">Save project</button>
        ${p.phases.length ? "" : `<select id="apply-template">${Object.entries(state.meta.templates).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
          <button class="btn" type="button" id="apply-template-btn">Add standard phases</button>`}
        <button class="btn danger" type="button" id="delete-project">Delete project</button>
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

function me() { return Number($("#m-member").value) || null; }

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
      await api(`/api/phases/${tr.dataset.phase}`, { method: "PATCH", body: { ...data, member_id: me() } });
      toast("Phase saved"); await loadManage();
    } else if (t.matches("[data-delete-phase]")) {
      if (!confirm("Delete this phase and its history?")) return;
      await api(`/api/phases/${t.closest("tr").dataset.phase}`, { method: "DELETE" });
      toast("Phase deleted"); await loadManage();
    } else if (t.matches("[data-save-drawing]")) {
      const tr = t.closest("tr");
      await api(`/api/drawings/${tr.dataset.drawing}`, { method: "PATCH", body: { ...rowData(tr), member_id: me() } });
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
$("#m-member").addEventListener("change", (e) => storage("studio.me", e.target.value));
$("#m-new-project-btn").addEventListener("click", () => { $("#new-project").hidden = false; $('#new-project [name="code"]').focus(); });
$("#cancel-new-project").addEventListener("click", () => { $("#new-project").hidden = true; });

// ---------------------------------------------------------------------------
// data & sync view
// ---------------------------------------------------------------------------
async function loadSources() {
  $("#gdrive-state").innerHTML = state.meta.gdrive_configured
    ? `${badge("on_track")} Connected with a service account.`
    : `${badge("at_risk")} Not connected yet — set <code>GOOGLE_SERVICE_ACCOUNT_FILE</code> on the server (see README).`;
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
  const known = ["wall", "manage", "data"].includes(view) ? view : "wall";
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== `view-${known}`; });
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === known));
  if (known === "wall") loadDashboard();
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

async function init() {
  applyTheme(storage("studio.theme"));
  ["#filter-lead", "#filter-health", "#sort-by"].forEach((sel) => {
    const saved = storage(`studio.${sel}`);
    if (saved != null) $(sel).value = saved;
  });
  tick(); setInterval(tick, 10000);
  state.meta = await api("/api/meta");
  $("#template-select").innerHTML = `<option value="">No phases (add manually)</option>` +
    Object.entries(state.meta.templates).map(([k, v]) => `<option value="${k}" ${k === "sia112" ? "selected" : ""}>${esc(v)}</option>`).join("");
  await loadMembers();
  window.addEventListener("hashchange", route);
  route();
}

init().catch((err) => toast(err.message));
