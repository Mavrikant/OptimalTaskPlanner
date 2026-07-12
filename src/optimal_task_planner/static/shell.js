"use strict";
/* ================= onboarding tour ================= */
const OB_STEPS = [
  { key: "welcome", icon: "brand" },
  { key: "resources", icon: "package" },
  { key: "tasks", icon: "tasks" },
  { key: "schedule", icon: "gantt" },
];
let obStep = 0;

function showOnboarding(step) {
  obStep = Math.max(0, Math.min(OB_STEPS.length - 1, step));
  const { key, icon: ic } = OB_STEPS[obStep];
  $("#obIcon").innerHTML = icon(ic);
  $("#obTitle").textContent = t(`ob.${key}.title`);
  $("#obBody").innerHTML = t(`ob.${key}.body`);
  const dots = $("#obDots"); dots.innerHTML = "";
  OB_STEPS.forEach((_, i) => {
    const d = document.createElement("button");
    d.className = i === obStep ? "active" : "";
    d.onclick = () => showOnboarding(i);
    dots.appendChild(d);
  });
  $("#obPrev").hidden = obStep === 0;
  $("#obNext").hidden = obStep === OB_STEPS.length - 1;
  $("#obStart").hidden = obStep !== OB_STEPS.length - 1;
  const langBox = $("#obLang"); langBox.innerHTML = "";
  LANGUAGES.forEach(l => {
    const b = document.createElement("button");
    b.className = l.code === LANG ? "active" : "";
    b.title = l.name;
    b.innerHTML = `<span class="flag">${l.flag}</span>`;
    b.onclick = () => { setLang(l.code); showOnboarding(obStep); };
    langBox.appendChild(b);
  });
  $("#onboardBack").hidden = false;
}
function closeOnboarding() {
  localStorage.setItem("optimal-task-planner.onboarded", "1");
  $("#onboardBack").hidden = true;
}
$("#obSkip").onclick = closeOnboarding;
$("#obStart").onclick = closeOnboarding;

/* dark / light theme toggle (initial value set by the inline head script) */
function applyThemeIcon() {
  $("#btnTheme").innerHTML =
    icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon");
}
$("#btnTheme").onclick = () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("optimal-task-planner.theme", next);
  applyThemeIcon();
  if (project) renderSchedule(); // the Gantt SVG bakes theme colours in
};
applyThemeIcon();
$("#obNext").onclick = () => showOnboarding(obStep + 1);
$("#obPrev").onclick = () => showOnboarding(obStep - 1);
$("#btnTour").onclick = () => showOnboarding(0);
document.addEventListener("keydown", e => {
  if ($("#onboardBack").hidden) return;
  if (e.key === "Escape") closeOnboarding();
  if (e.key === "ArrowRight") showOnboarding(obStep + 1);
  if (e.key === "ArrowLeft") showOnboarding(obStep - 1);
});

/* section help screens (content lives in i18n.js as info.* keys) */
function infoModal(key) {
  openModal({
    title: t(key + ".title"),
    body: `<div class="info-body">${t(key + ".body")}</div>`,
    hideCancel: true, wide: true,
  });
}
$("#btnInfoSolve").onclick = () => infoModal("info.solve");

/* solver settings (per-project): time limit, workers, planning horizon days */
$("#btnSolverOpts").onclick = () => {
  const so = project.solver || {};
  const num = (id, key, val, min, max) =>
    `<div class="field"><label>${t(key)}</label>
      <input id="${id}" type="number" min="${min}" max="${max}" value="${val}"></div>`;
  openModal({
    title: t("solver.title"),
    body: num("soTime", "solver.timeLimit", so.time_limit_s ?? 20, 5, 120) +
      num("soWorkers", "solver.workers", so.workers ?? 8, 1, 16) +
      num("soDays", "solver.days", so.days ?? 14, 1, 31),
    onOk: () => {
      const clamp = (id, min, max, def) => {
        const v = parseInt($("#" + id).value, 10);
        return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def;
      };
      project.solver = {
        time_limit_s: clamp("soTime", 5, 120, 20),
        workers: clamp("soWorkers", 1, 16, 8),
        days: clamp("soDays", 1, 31, 14),
      };
      // saveNow() returns the recomputed horizon (day count may have changed)
      saveNow().then(() => renderAll());
    },
  });
};
$("#btnInfoPool").onclick = () => infoModal("info.pool");
$("#btnInfoCalendar").onclick = () => infoModal("info.calendar");
$("#btnInfoAvail").onclick = () => infoModal("info.avail");
$("#btnInfoTasks").onclick = () => infoModal("info.tasks");
$("#btnInfoSchedule").onclick = () => infoModal("info.schedule");

/* ================= tabs & language ================= */
function activateTab(name) {
  $$("#tabs button").forEach(b => {
    const active = b.dataset.tab === name;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
  $$(".tab").forEach(s => s.classList.toggle("active", s.id === "tab-" + name));
  document.body.classList.toggle("tab-schedule", name === "schedule");
  if (name === "schedule") renderSchedule(); // re-measure width for the Gantt
  if (name === "insights") renderInsights();
}
$$("#tabs button").forEach(b => { b.onclick = () => activateTab(b.dataset.tab); });
$("#tabs").addEventListener("keydown", e => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const tabs = $$("#tabs button");
  const idx = tabs.findIndex(b => b.classList.contains("active"));
  const next = (idx + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
  tabs[next].focus();
  activateTab(tabs[next].dataset.tab);
});

// keyboard alternative to drag-reordering: Alt+Arrow moves the selected task
document.addEventListener("keydown", e => {
  if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  if (!document.querySelector("#tab-tasks.active") || !$("#modalBack").hidden) return;
  const task = selTask(); if (!task) return;
  const i = project.tasks.indexOf(task);
  const j = e.key === "ArrowUp" ? i - 1 : i + 1;
  if (j < 0 || j >= project.tasks.length) return;
  e.preventDefault();
  [project.tasks[i], project.tasks[j]] = [project.tasks[j], project.tasks[i]];
  markSave(); renderTaskList();
});

/* language dropdown: flags come from the LANGUAGES registry in i18n.js */
function renderLangMenu() {
  const current = LANGUAGES.find(l => l.code === LANG) || LANGUAGES[0];
  $("#langFlag").innerHTML = current.flag;
  const list = $("#langList"); list.innerHTML = "";
  LANGUAGES.forEach(l => {
    const b = document.createElement("button");
    b.className = "lang-item"; b.setAttribute("role", "menuitem");
    b.innerHTML = `<span class="flag">${l.flag}</span><span>${esc(l.name)}</span>` +
      (l.code === LANG ? `<span class="check">${icon("check")}</span>` : "");
    b.onclick = () => { closeLangList(); setLang(l.code); };
    list.appendChild(b);
  });
}
function closeLangList() {
  $("#langList").hidden = true;
  $("#langBtn").setAttribute("aria-expanded", "false");
}
$("#langBtn").onclick = e => {
  e.stopPropagation();
  const list = $("#langList");
  list.hidden = !list.hidden;
  $("#langBtn").setAttribute("aria-expanded", String(!list.hidden));
};
document.addEventListener("click", e => {
  if (!e.target.closest("#langMenu")) closeLangList();
});

/* ================= project switcher ================= */
function renderProjectLabel() {
  $("#projName").textContent = project ? project.name : "";
}
function closeProjMenu() {
  $("#projList").hidden = true;
  $("#projBtn").setAttribute("aria-expanded", "false");
}
document.addEventListener("click", e => {
  if (!e.target.closest("#projMenu")) closeProjMenu();
});

async function switchProject(pid) {
  if (pid !== currentPid) {
    await saveNow().catch(() => {});
    currentPid = pid;
    localStorage.setItem("optimal-task-planner.pid", pid);
    ganttZoom = 1;
    selectedId = null; selectedUnit = null;
  }
  await loadCurrent();
}

$("#projBtn").onclick = async e => {
  e.stopPropagation();
  const list = $("#projList");
  if (!list.hidden) { closeProjMenu(); return; }
  projectList = (await api("/api/projects")).projects;
  list.innerHTML = "";
  projectList.forEach(p => {
    const b = document.createElement("button");
    b.className = "proj-item"; b.setAttribute("role", "menuitem");
    b.innerHTML = `<span class="proj-item-name">${esc(p.name)}</span>` +
      (p.id === currentPid ? `<span class="check">${icon("check")}</span>` : "");
    b.onclick = () => { closeProjMenu(); switchProject(p.id); };
    list.appendChild(b);
  });
  const sep = () => {
    const s = document.createElement("div");
    s.className = "proj-sep"; list.appendChild(s);
  };
  const item = (ic, key, fn, danger) => {
    const b = document.createElement("button");
    b.className = "proj-item" + (danger ? " danger" : "");
    b.setAttribute("role", "menuitem");
    b.innerHTML = `${icon(ic)}<span>${esc(t(key))}</span>`;
    b.onclick = () => { closeProjMenu(); fn(); };
    list.appendChild(b);
  };
  sep();
  item("plus", "proj.new", newProject);
  item("upload", "proj.import", () => $("#projImportFile").click());
  sep();
  item("pencil", "proj.rename", renameProject);
  item("copy", "proj.duplicate", duplicateProject);
  item("download", "proj.export", exportProject);
  item("calendar", "proj.backups", showBackups);
  item("trash", "proj.delete", deleteProject, true);
  list.hidden = false;
  $("#projBtn").setAttribute("aria-expanded", "true");
};

function newProject() {
  openModal({
    title: t("proj.new"),
    body: `<div class="field"><label>${t("proj.name")}</label>
      <input id="projNameInput" type="text" value=""></div>`,
    onOk: () => {
      const name = $("#projNameInput").value.trim();
      if (!name) return false;
      api("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then(d => { toast(t("proj.created"), "success"); switchProject(d.id); })
        .catch(err => toast(err.message, "error"));
    },
  });
}
function renameProject() {
  openModal({
    title: t("proj.rename"),
    body: `<div class="field"><label>${t("proj.name")}</label>
      <input id="projNameInput" type="text" value="${esc(project.name)}"></div>`,
    onOk: () => {
      const name = $("#projNameInput").value.trim();
      if (!name) return false;
      api(P(), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then(() => { project.name = name; histReset(); renderProjectLabel(); })
        .catch(err => toast(err.message, "error"));
    },
  });
}
async function duplicateProject() {
  const d = await api(`${P()}/duplicate`, { method: "POST" });
  toast(t("proj.created"), "success");
  await switchProject(d.id);
}
function exportProject() {
  const safe = (project.name || "project").replace(/[^\w-]+/g, "_");
  downloadBlob(JSON.stringify(project, null, 2), "application/json",
    `optimal-task-planner-${safe}.json`);
}
$("#projImportFile").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const raw = JSON.parse(await f.text());
    const d = await api("/api/projects/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raw),
    });
    toast(t("proj.created"), "success");
    await switchProject(d.id);
  } catch (_) { toast(t("proj.importFailed"), "error"); }
  e.target.value = "";
};
async function deleteProject() {
  if (!await confirmModal(t("proj.delete"),
    t("proj.deleteConfirm", { name: project.name }))) return;
  await api(P(), { method: "DELETE" });
  currentPid = null;
  await loadProjects();
  await loadCurrent();
}
async function showBackups() {
  const d = await api(`${P()}/backups`);
  const rows = d.backups.length
    ? d.backups.map(b =>
      `<div class="backup-row"><span>${esc(fmtDT(b.created_at))}</span>
         <button class="btn small" data-b="${esc(b.name)}">${esc(t("proj.backupRestore"))}</button>
       </div>`).join("")
    : `<p class="muted small">${t("proj.backupsEmpty")}</p>`;
  openModal({
    title: t("proj.backupsTitle"),
    body: `<div class="backup-list">${rows}</div>`,
    hideCancel: true, wide: true,
  });
  document.querySelectorAll("#modalBody [data-b]").forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.b;
      closeModal();
      if (!await confirmModal(t("proj.backupsTitle"),
        t("proj.backupRestoreConfirm"), t("proj.backupRestore"))) return;
      await api(`${P()}/backups/${name}/restore`, { method: "POST" });
      await loadCurrent();
      toast(t("proj.backupRestored"), "success");
    };
  });
}

