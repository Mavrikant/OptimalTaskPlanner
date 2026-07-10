"use strict";
/* ================= state & core helpers ================= */
let project = null, horizon = null, selectedId = null, selectedUnit = null, saveTimer = null;
let currentPid = localStorage.getItem("labplanner.pid") || null;
let projectList = [];
const P = () => "/api/projects/" + currentPid;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = await r.text();
    try { msg = JSON.parse(msg).detail || msg; } catch (_) { /* raw text */ }
    throw new Error(msg);
  }
  return r.json();
}

const selTask = () => project.tasks.find(x => x.id === selectedId) || null;
const locale = () => LANG === "tr" ? "tr-TR" : "en-US";

/* Dates are written in full ("Monday, July 13") wherever there is room;
   compact forms are only used where space is tight (e.g. Gantt at low zoom). */
function fmtDT(v) {
  const d = v instanceof Date ? v : new Date(v);
  return new Intl.DateTimeFormat(locale(), {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit",
    minute: "2-digit", hour12: false,
  }).format(d);
}
function fmtDateLong(iso) {
  return new Intl.DateTimeFormat(locale(), {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(iso + "T00:00:00"));
}
function dayLabel(d) {  // compact fallback for narrow spaces
  return new Intl.DateTimeFormat(locale(), {
    weekday: "short", day: "numeric", month: "numeric",
  }).format(new Date(horizon.day_dates[d] + "T00:00:00"));
}
function dayLabelLong(d) {
  return new Intl.DateTimeFormat(locale(), {
    weekday: "long", day: "numeric", month: "long",
  }).format(new Date(horizon.day_dates[d] + "T00:00:00"));
}
function fmtHours(minutes) {
  const h = minutes / 60;
  const txt = LANG === "tr" ? String(h).replace(".", ",") : String(h);
  return `${txt} ${t("unit.hours")}`;
}
const slotHHMM = s => `${String(Math.floor(s / 2)).padStart(2, "0")}:${s % 2 ? "30" : "00"}`;
const hhmmSlot = v => { const [h, m] = v.split(":").map(Number); return h * 2 + (m >= 30 ? 1 : 0); };

const isOffDay = d => horizon.day_weekdays[d] >= 5 || horizon.holiday_flags[d];
const isWork = (d, s) => !isOffDay(d) &&
  s >= horizon.work_start_slot && s < horizon.work_end_slot;

/* ================= save ================= */
function markSave() {
  histPush();
  const el = $("#saveState");
  el.textContent = t("save.saving"); el.classList.remove("error");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}
async function saveNow() {
  clearTimeout(saveTimer);
  histPush();
  const el = $("#saveState");
  try {
    const d = await api(P(), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    horizon = d.horizon;
    el.textContent = t("save.saved"); el.classList.remove("error");
  } catch (e) {
    el.textContent = t("save.failed"); el.classList.add("error");
    toast(`${t("save.failed")}: ${e.message}`, "error");
    throw e;
  }
}

/* ================= undo / redo ================= */
/* Snapshot-based client history: every mutation calls markSave()/saveNow(),
   which pushes the pre-mutation state (histLast) onto the undo stack. */
let undoStack = [], redoStack = [], histLast = null, histMuted = false;
const histSerialize = () => JSON.stringify(project);

function histReset() {
  undoStack = []; redoStack = [];
  histLast = project ? histSerialize() : null;
  updateHistButtons();
}
function histPush() {
  if (histMuted || histLast == null || !project) return;
  const cur = histSerialize();
  if (cur === histLast) return;
  undoStack.push(histLast);
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  histLast = cur;
  updateHistButtons();
}
function histApply(state) {
  histMuted = true;
  project = JSON.parse(state);
  histLast = state;
  if (!project.tasks.some(x => x.id === selectedId)) {
    selectedId = project.tasks.length ? project.tasks[0].id : null;
  }
  saveNow().catch(() => {});
  renderAll();
  histMuted = false;
  updateHistButtons();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(histSerialize());
  histApply(undoStack.pop());
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(histSerialize());
  histApply(redoStack.pop());
}
function updateHistButtons() {
  $("#btnUndo").disabled = !undoStack.length;
  $("#btnRedo").disabled = !redoStack.length;
}
$("#btnUndo").onclick = undo;
$("#btnRedo").onclick = redo;
document.addEventListener("keydown", e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k !== "z" && k !== "y") return;
  const tag = (document.activeElement || {}).tagName;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;  // keep native text undo
  if (!$("#modalBack").hidden || !$("#onboardBack").hidden) return;
  e.preventDefault();
  if (k === "y" || (k === "z" && e.shiftKey)) redo(); else undo();
});

/* ================= toasts & modal ================= */
function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = "toast " + type; el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

let modalOpts = null, modalPrevFocus = null;
function openModal(opts) {
  modalOpts = opts;
  modalPrevFocus = document.activeElement;
  $("#modalTitle").textContent = opts.title;
  $("#modalBody").innerHTML = opts.body;
  $("#modalOk").textContent = opts.okLabel || t("modal.ok");
  $("#modalCancel").textContent = t("modal.cancel");
  $("#modalCancel").hidden = !!opts.hideCancel;
  $("#modalBack .modal").classList.toggle("wide", !!opts.wide);
  $("#modalBack").hidden = false;
  const first = $("#modalBody").querySelector("input,select") || $("#modalOk");
  first.focus(); if (first.select) first.select();
}
function closeModal() {
  const opts = modalOpts; modalOpts = null;
  $("#modalBack").hidden = true; $("#modalBody").innerHTML = "";
  if (modalPrevFocus && modalPrevFocus.focus) modalPrevFocus.focus();
  modalPrevFocus = null;
  if (opts && opts.onClose) opts.onClose();
}
$("#modalOk").onclick = () => {
  if (modalOpts && modalOpts.onOk && modalOpts.onOk() === false) return;
  closeModal();
};
$("#modalCancel").onclick = closeModal;
$("#modalBack").addEventListener("mousedown", e => {
  if (e.target.id === "modalBack") closeModal();
});
document.addEventListener("keydown", e => {
  if ($("#modalBack").hidden) return;
  if (e.key === "Escape") closeModal();
  if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") $("#modalOk").click();
  if (e.key === "Tab") {  // keep focus inside the dialog
    const focusable = Array.from(document.querySelectorAll(
      "#modalBack input, #modalBack select, #modalBack button"))
      .filter(x => !x.hidden && !x.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
function confirmModal(title, message, okLabel) {
  return new Promise(resolve => {
    let ok = false;
    openModal({
      title, body: `<p>${esc(message)}</p>`, okLabel: okLabel || t("modal.delete"),
      onOk: () => { ok = true; }, onClose: () => resolve(ok),
    });
  });
}

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
  localStorage.setItem("labplanner.onboarded", "1");
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
  localStorage.setItem("labplanner.theme", next);
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
    localStorage.setItem("labplanner.pid", pid);
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
    `labplanner-${safe}.json`);
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

/* ================= equipment pool ================= */
const autoUnitNames = (name, count) =>
  count === 1 ? [name] : Array.from({ length: count }, (_, i) => `${name}-${i + 1}`);
const unitsOf = eq =>
  (eq.unit_names && eq.unit_names.length === eq.count && eq.count > 0)
    ? eq.unit_names : autoUnitNames(eq.name, eq.count);
function allUnits() {
  const out = [];
  project.equipment.forEach(eq => out.push(...unitsOf(eq)));
  return out;
}
const eqOfUnit = unit => project.equipment.find(eq => unitsOf(eq).includes(unit));

const iconBtn = (name, titleKey, cls = "") =>
  `<button class="btn icon small ${cls}" title="${esc(t(titleKey))}" ` +
  `aria-label="${esc(t(titleKey))}">${icon(name)}</button>`;

function renderResources() {
  const tb = $("#eqTable tbody"); tb.innerHTML = "";
  let units = 0;
  if (!project.equipment.length) {
    tb.innerHTML = `<tr><td colspan="3" style="border:none;padding:0">
      <div class="empty-state">${esc(t("res.empty"))}</div></td></tr>`;
  }
  project.equipment.forEach((eq, i) => {
    units += eq.count;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(eq.name)}</td><td>${eq.count}</td>
      <td class="row-actions">${iconBtn("pencil", "res.edit")}${iconBtn("trash", "res.delete", "danger")}</td>`;
    const [btnEdit, btnDel] = tr.querySelectorAll(".row-actions .btn");
    btnEdit.onclick = () => eqModal(i);
    btnDel.onclick = async () => {
      const used = project.tasks.filter(x => (x.resources[eq.name] || 0) > 0);
      const msg = used.length
        ? t("eq.usedByTasks", { name: eq.name, n: used.length })
        : t("eq.deleteConfirm", { name: eq.name });
      if (!await confirmModal(t("eq.deleteTitle"), msg)) return;
      used.forEach(x => delete x.resources[eq.name]);
      project.equipment.splice(i, 1);
      markSave(); renderAll();
    };
    tb.appendChild(tr);
  });
  $("#poolSummary").textContent =
    t("res.poolSummary", { types: project.equipment.length, units });
}

function eqModal(i) {
  const isNew = i == null;
  const eq = isNew ? { name: "", count: 1, unit_names: [], unavailable: {} }
    : project.equipment[i];
  openModal({
    title: t(isNew ? "eq.modalNew" : "eq.modalEdit"),
    body: `
      <div class="field"><label>${t("eq.name")}</label>
        <input id="eqName" type="text" value="${esc(eq.name)}"></div>
      <div class="field"><label>${t("eq.count")}</label>
        <input id="eqCount" type="number" min="0" max="99" value="${eq.count}"></div>
      <div class="field"><label>${t("eq.unitNames")}</label>
        <div class="muted small" style="margin-bottom:6px">${t("eq.unitNamesHint")}</div>
        <div id="unitNamesWrap" class="unit-names"></div></div>`,
    onOk: () => {
      const name = $("#eqName").value.trim();
      const count = parseInt($("#eqCount").value, 10);
      if (!name || !(count >= 0 && count <= 99)) return false;
      if (project.equipment.some((e, j) => j !== i && e.name === name)) {
        toast(t("eq.nameExists"), "error"); return false;
      }
      const raw = Array.from($("#unitNamesWrap").querySelectorAll("input"))
        .map(x => x.value.trim());
      let unitNames = [];
      if (raw.some(v => v)) {
        if (raw.some(v => !v) || new Set(raw).size !== raw.length) {
          toast(t("eq.unitNamesInvalid"), "error"); return false;
        }
        unitNames = raw;
      }
      if (unitNames.join("\u0000") === autoUnitNames(name, count).join("\u0000")) {
        unitNames = []; // identical to automatic naming — store canonically
      }
      const candidate = unitNames.length ? unitNames : autoUnitNames(name, count);
      const others = project.equipment.filter((e, j) => j !== i).flatMap(unitsOf);
      if (candidate.some(u => others.includes(u))) {
        toast(t("eq.unitNamesTaken"), "error"); return false;
      }
      if (isNew) {
        project.equipment.push({ name, count, unit_names: unitNames, unavailable: {} });
      } else {
        applyEqChange(eq, name, count, unitNames);
      }
      markSave(); renderAll();
    },
  });

  // unit-name inputs live-update with the count/name fields
  const wrap = $("#unitNamesWrap");
  const currentValues = () => Array.from(wrap.querySelectorAll("input")).map(x => x.value);
  function renderNameInputs(values) {
    const count = Math.min(99, Math.max(0, parseInt($("#eqCount").value, 10) || 0));
    const auto = autoUnitNames($("#eqName").value.trim() || "?", count);
    wrap.innerHTML = "";
    for (let k = 0; k < count; k++) {
      const inp = document.createElement("input");
      inp.type = "text"; inp.placeholder = auto[k]; inp.value = values[k] || "";
      wrap.appendChild(inp);
    }
  }
  renderNameInputs(eq.unit_names && eq.unit_names.length ? eq.unit_names : []);
  $("#eqCount").oninput = () => renderNameInputs(currentValues());
  $("#eqName").oninput = () => renderNameInputs(currentValues());
}

function applyEqChange(eq, newName, newCount, newUnitNames) {
  const oldName = eq.name;
  const oldUnits = unitsOf(eq);
  if (newName !== oldName) {       // cascade rename into task resource lists
    project.tasks.forEach(x => {
      if (oldName in x.resources) {
        x.resources[newName] = x.resources[oldName];
        delete x.resources[oldName];
      }
    });
  }
  eq.name = newName; eq.count = newCount; eq.unit_names = newUnitNames;
  const newUnits = unitsOf(eq);
  const remapped = {};
  oldUnits.forEach((u, idx) => {   // keep windows of surviving units, drop removed ones
    if (idx < newUnits.length && eq.unavailable[u]) remapped[newUnits[idx]] = eq.unavailable[u];
  });
  eq.unavailable = remapped;
  // carry unit renames into the solved schedule so its assignments stay visible —
  // a pure rename doesn't change the plan, only the labels
  if (project.schedule && project.schedule.tasks) {
    const renames = {};
    oldUnits.forEach((u, idx) => {
      if (idx < newUnits.length && newUnits[idx] !== u) renames[u] = newUnits[idx];
    });
    if (Object.keys(renames).length) {
      project.schedule.tasks.forEach(stt => {
        stt.units = stt.units.map(u => renames[u] || u);
      });
    }
  }
}

$("#btnAddEq").onclick = () => eqModal(null);
$("#btnExportPool").onclick = () => {
  const blob = new Blob(
    [JSON.stringify({ equipment: project.equipment }, null, 2)],
    { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "equipment_pool.json"; a.click();
  URL.revokeObjectURL(a.href);
};
$("#btnImportPool").onclick = () => $("#poolFile").click();
$("#poolFile").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    const eqs = d.equipment || d;
    if (!Array.isArray(eqs) ||
        eqs.some(x => typeof x.name !== "string" || typeof x.count !== "number")) throw 0;
    project.equipment = eqs.map(x => ({
      name: x.name, count: x.count,
      unit_names: Array.isArray(x.unit_names) ? x.unit_names : [],
      unavailable: (x.unavailable && typeof x.unavailable === "object") ? x.unavailable : {},
    }));
    markSave(); renderAll(); toast(t("import.done"), "success");
  } catch (_) { toast(t("import.invalid"), "error"); }
  e.target.value = "";
};

/* ================= unit availability ================= */
function renderUnitPanel() {
  const units = allUnits();
  const sel = $("#unitSelect");
  if (!units.length) {
    sel.innerHTML = "";
    $("#unitGridWrap").innerHTML = `<p class="muted small">${t("res.noUnits")}</p>`;
    return;
  }
  if (!selectedUnit || !units.includes(selectedUnit)) selectedUnit = units[0];
  sel.innerHTML = units.map(u =>
    `<option ${u === selectedUnit ? "selected" : ""}>${esc(u)}</option>`).join("");
  renderUnitGrid();
}
$("#unitSelect").onchange = e => { selectedUnit = e.target.value; renderUnitGrid(); };
$("#btnClearUnit").onclick = () => {
  const eq = eqOfUnit(selectedUnit);
  if (eq && eq.unavailable[selectedUnit]) {
    delete eq.unavailable[selectedUnit];
    markSave(); renderUnitGrid();
  }
};

function renderUnitGrid() {
  const eq = eqOfUnit(selectedUnit);
  if (!eq) return;
  buildSlotGrid($("#unitGridWrap"), {
    getState: (dateKey, s) =>
      ((eq.unavailable[selectedUnit] || {})[dateKey] || []).includes(s) ? "unavailable" : "",
    setState: (dateKey, s, val) => {
      if (!eq.unavailable[selectedUnit]) eq.unavailable[selectedUnit] = {};
      const byDate = eq.unavailable[selectedUnit];
      let arr = byDate[dateKey] || [];
      if (val === "unavailable") {
        if (!arr.includes(s)) arr = arr.concat(s).sort((a, b) => a - b);
      } else {
        arr = arr.filter(x => x !== s);
      }
      if (arr.length) byDate[dateKey] = arr; else delete byDate[dateKey];
      if (!Object.keys(byDate).length) delete eq.unavailable[selectedUnit];
      markSave();
    },
    pickValue: (e, td) => td.classList.contains("unavailable") ? "" : "unavailable",
  });
}

/* ================= shared slot grid ================= */
/* Painting uses Pointer Events so mouse, pen and touch all work; a roving
   keyboard cursor (arrows + Space) offers a pointer-free alternative. */
let painting = false, paintVal = "";
document.addEventListener("pointerup", () => { painting = false; });
document.addEventListener("pointercancel", () => { painting = false; });

function buildSlotGrid(wrap, { getState, setState, pickValue }) {
  const tbl = document.createElement("table"); tbl.className = "slotgrid";
  const head = document.createElement("tr");
  let hh = "<th></th>";
  for (let h = 0; h < 24; h++) hh += `<th colspan="2">${h}</th>`;
  head.innerHTML = hh; tbl.appendChild(head);
  const nowS = horizon.now_slot;
  const SPD = horizon.slots_per_day;
  const cells = [];
  for (let d = 0; d < horizon.days; d++) {
    const tr = document.createElement("tr");
    const lbl = document.createElement("td");
    lbl.className = "daylabel" + (horizon.holiday_flags[d] ? " holiday" : "");
    lbl.textContent = dayLabelLong(d);
    tr.appendChild(lbl);
    const dateKey = horizon.day_dates[d];
    const row = [];
    for (let s = 0; s < SPD; s++) {
      const td = document.createElement("td");
      const abs = d * SPD + s;
      const past = abs < nowS;
      td.className = "cell " +
        (isWork(d, s) ? "work" : (isOffDay(d) ? "weekend" : "offday")) +
        (past ? " past" : "") +
        (s % 2 === 0 ? " hb" : "") + (s % 12 === 0 ? " hb6" : "");
      const st = getState(dateKey, s);
      if (st) td.classList.add(st);
      if (!past && setState) {
        td._apply = v => {
          td.classList.remove("preferred", "unavailable");
          if (v) td.classList.add(v);
          setState(dateKey, s, v);
        };
        td.addEventListener("pointerdown", e => {
          e.preventDefault();
          paintVal = pickValue(e, td);
          painting = true;
          td._apply(paintVal);
          // release the implicit touch capture so pointermove reaches other cells
          if (e.pointerId != null && td.hasPointerCapture && td.hasPointerCapture(e.pointerId)) {
            td.releasePointerCapture(e.pointerId);
          }
        });
        td.oncontextmenu = e => e.preventDefault();
      }
      tr.appendChild(td);
      row.push(td);
    }
    cells.push(row);
    tbl.appendChild(tr);
  }
  tbl.addEventListener("pointermove", e => {
    if (!painting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest ? el.closest("td.cell") : null;
    if (cell && cell._apply) cell._apply(paintVal);
  });
  wrap.innerHTML = ""; wrap.appendChild(tbl);
  wrap.oncontextmenu = e => e.preventDefault();

  if (!setState) return;
  // keyboard painting: arrows move a visible cursor, PageUp/Down jump 6 hours,
  // Space/Enter applies the active paint mode on the cursor cell
  wrap.tabIndex = 0;
  let cur = null;
  const setCursor = (d, s) => {
    if (cur) cells[cur.d][cur.s].classList.remove("cursor");
    cur = { d, s };
    const td = cells[d][s];
    td.classList.add("cursor");
    td.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  wrap.addEventListener("keydown", e => {
    const move = {
      ArrowLeft: [0, -1], ArrowRight: [0, 1],
      ArrowUp: [-1, 0], ArrowDown: [1, 0],
      PageUp: [0, -12], PageDown: [0, 12],
    }[e.key];
    if (move) {
      e.preventDefault();
      if (!cur) { setCursor(0, Math.min(Math.max(nowS, 0), SPD - 1)); return; }
      setCursor(
        Math.max(0, Math.min(horizon.days - 1, cur.d + move[0])),
        Math.max(0, Math.min(SPD - 1, cur.s + move[1])),
      );
    } else if ((e.key === " " || e.key === "Enter") && cur) {
      e.preventDefault();
      const td = cells[cur.d][cur.s];
      if (td._apply) td._apply(pickValue({ button: 0 }, td));
    }
  });
  wrap.addEventListener("blur", () => {
    if (cur) { cells[cur.d][cur.s].classList.remove("cursor"); cur = null; }
  });
}

/* ================= working calendar ================= */
function fillTimeSelect(sel, from, to, selected) {
  sel.innerHTML = "";
  for (let s = from; s <= to; s++) {
    const o = document.createElement("option");
    o.value = s; o.textContent = slotHHMM(s);
    if (s === selected) o.selected = true;
    sel.appendChild(o);
  }
}
function renderWorkCalendar() {
  fillTimeSelect($("#workStart"), 0, 47, hhmmSlot(project.calendar.work_start));
  fillTimeSelect($("#workEnd"), 1, 48, hhmmSlot(project.calendar.work_end));
  renderHolidayChips();
}
async function onWorkHoursChange() {
  const ws = parseInt($("#workStart").value, 10);
  const we = parseInt($("#workEnd").value, 10);
  if (ws >= we) {
    toast(t("workhours.invalid"), "error");
    renderWorkCalendar(); return;
  }
  project.calendar.work_start = slotHHMM(ws);
  project.calendar.work_end = slotHHMM(we);
  await saveNow(); renderAll();
}
$("#workStart").onchange = onWorkHoursChange;
$("#workEnd").onchange = onWorkHoursChange;

function renderHolidayChips() {
  const box = $("#holidayChips"); box.innerHTML = "";
  if (!project.calendar.holidays.length) {
    box.innerHTML = `<span class="muted small">${t("res.noHolidays")}</span>`;
    return;
  }
  [...project.calendar.holidays].sort().forEach(d => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.title = d;
    chip.innerHTML = `${esc(fmtDateLong(d))} <button title="${t("res.delete")}">&times;</button>`;
    chip.querySelector("button").onclick = async () => {
      project.calendar.holidays = project.calendar.holidays.filter(x => x !== d);
      await saveNow(); renderAll();
    };
    box.appendChild(chip);
  });
}
$("#btnAddHoliday").onclick = async () => {
  const v = $("#holidayDate").value;
  if (!v || project.calendar.holidays.includes(v)) return;
  project.calendar.holidays.push(v);
  await saveNow(); renderAll();
};
$("#btnFillHolidays").onclick = async () => {
  const country = $("#holidayCountry").value, year = $("#holidayYear").value;
  if (!country) return;
  try {
    const d = await api(`/api/holidays?country=${encodeURIComponent(country)}&year=${year}`);
    const before = new Set(project.calendar.holidays);
    d.holidays.forEach(h => { if (!before.has(h.date)) project.calendar.holidays.push(h.date); });
    const added = project.calendar.holidays.length - before.size;
    await saveNow(); renderAll();
    toast(t("res.holidaysAdded", { n: added }), "success");
  } catch (e) { toast(t("holiday.loadFailed", { msg: e.message }), "error"); }
};
async function loadCountries() {
  try {
    const d = await api("/api/holidays/countries");
    const sel = $("#holidayCountry");
    sel.innerHTML = d.countries.map(c =>
      `<option value="${esc(c.code)}">${esc(c.name)} (${esc(c.code)})</option>`).join("");
    const preferred = LANG === "tr" ? "TR" : "US";
    if (d.countries.some(c => c.code === preferred)) sel.value = preferred;
    const ysel = $("#holidayYear");
    const y = new Date().getFullYear();
    ysel.innerHTML = [y, y + 1].map(v => `<option>${v}</option>`).join("");
  } catch (_) { /* offline — manual holiday entry still works */ }
}

/* ================= task list ================= */
function renderTaskList() {
  const ul = $("#taskList"); ul.innerHTML = "";
  if (!project.tasks.length) {
    ul.innerHTML = `<li class="empty-state" style="cursor:default">${esc(t("tasks.empty"))}</li>`;
    return;
  }
  project.tasks.forEach((task, i) => {
    const li = document.createElement("li");
    li.draggable = true; li.dataset.id = task.id;
    li.className = (task.id === selectedId ? "selected" : "") +
      (task.status === "done" ? " done" : "");
    const badges =
      (task.status === "in_progress"
        ? `<span class="badge-mini run" title="${esc(t("status.in_progress"))}">${icon("play")}</span>` : "") +
      (task.status === "done"
        ? `<span class="badge-mini fin" title="${esc(t("status.done"))}">${icon("check")}</span>` : "") +
      (task.depends_on && task.depends_on.length
        ? `<span class="badge-mini dep" title="${esc(t("tasks.dependsOn"))}">${icon("link")}</span>` : "") +
      (task.pinned_start
        ? `<span class="badge-mini pinb" title="${esc(t("tasks.pinnedStart"))}">${icon("pin")}</span>` : "");
    li.innerHTML = `<span class="drag">${icon("grip")}</span>
      <span class="prio">${i + 1}.</span>
      <span class="tname">${esc(task.name)}</span>${badges}
      <span class="thours">${fmtHours(task.minutes)}</span>`;
    li.onclick = () => { selectedId = task.id; renderTaskList(); renderEditor(); };
    li.ondragstart = e => {
      e.dataTransfer.setData("text/plain", task.id);
      li.classList.add("dragging");
    };
    li.ondragend = () => li.classList.remove("dragging");
    li.ondragover = e => e.preventDefault();
    li.ondrop = e => {
      e.preventDefault();
      const fromId = e.dataTransfer.getData("text/plain");
      const from = project.tasks.findIndex(x => x.id === fromId);
      const to = project.tasks.findIndex(x => x.id === task.id);
      if (from < 0 || to < 0 || from === to) return;
      const [m] = project.tasks.splice(from, 1);
      project.tasks.splice(to, 0, m);
      markSave(); renderTaskList(); renderEditor();
    };
    ul.appendChild(li);
  });
}
$("#btnAddTask").onclick = () => {
  const task = {
    id: uuid(), name: t("tasks.newName"), minutes: 120,
    work_hours_only: false, continue_next_day: false,
    deadline: null, earliest_start: null, pinned_start: null,
    depends_on: [], status: "pending", resources: {}, slots: {},
  };
  project.tasks.push(task); selectedId = task.id;
  markSave(); renderTaskList(); renderEditor();
};
$("#btnDupTask").onclick = () => {
  const task = selTask(); if (!task) return;
  const copy = JSON.parse(JSON.stringify(task));
  copy.id = uuid(); copy.name = `${task.name} ${t("tasks.copySuffix")}`;
  copy.status = "pending";
  project.tasks.splice(project.tasks.indexOf(task) + 1, 0, copy);
  selectedId = copy.id;
  markSave(); renderTaskList(); renderEditor();
};
$("#btnDelTask").onclick = async () => {
  const task = selTask(); if (!task) return;
  if (!await confirmModal(t("tasks.delete"), t("tasks.deleteConfirm", { name: task.name }))) return;
  const i = project.tasks.indexOf(task);
  project.tasks.splice(i, 1);
  project.tasks.forEach(x => {   // drop dangling dependency references
    if (x.depends_on && x.depends_on.includes(task.id)) {
      x.depends_on = x.depends_on.filter(d => d !== task.id);
    }
  });
  selectedId = project.tasks.length
    ? project.tasks[Math.min(i, project.tasks.length - 1)].id : null;
  markSave(); renderTaskList(); renderEditor();
};

/* ================= task editor ================= */
function renderEditor() {
  const el = $("#editor");
  const task = selTask();
  if (!task) { el.innerHTML = `<div class="muted">${t("tasks.none")}</div>`; return; }

  const dlDateOpts = horizon.day_dates.map((d, i) =>
    `<option value="${d}" ${task.deadline && task.deadline.date === d ? "selected" : ""}>
       ${dayLabelLong(i)} (${d})</option>`).join("");
  const dlSlot = task.deadline ? hhmmSlot(task.deadline.time) : 34; // default 17:00
  const dlTimeOpts = Array.from({ length: 49 }, (_, s) =>
    `<option value="${s}" ${s === dlSlot ? "selected" : ""}>${slotHHMM(s)}</option>`).join("");
  const es = task.earliest_start;
  const esDateOpts = horizon.day_dates.map((d, i) =>
    `<option value="${d}" ${es && es.date === d ? "selected" : ""}>
       ${dayLabelLong(i)} (${d})</option>`).join("");
  const esSlot = es ? hhmmSlot(es.time) : hhmmSlot(project.calendar.work_start);
  const esTimeOpts = Array.from({ length: 49 }, (_, s) =>
    `<option value="${s}" ${s === esSlot ? "selected" : ""}>${slotHHMM(s)}</option>`).join("");
  const pin = task.pinned_start;
  const pinDateOpts = horizon.day_dates.map((d, i) =>
    `<option value="${d}" ${pin && pin.date === d ? "selected" : ""}>
       ${dayLabelLong(i)} (${d})</option>`).join("");
  const pinSlot = pin ? hhmmSlot(pin.time) : hhmmSlot(project.calendar.work_start);
  const pinTimeOpts = Array.from({ length: 49 }, (_, s) =>
    `<option value="${s}" ${s === pinSlot ? "selected" : ""}>${slotHHMM(s)}</option>`).join("");
  const statusOpts = ["pending", "in_progress", "done"].map(v =>
    `<option value="${v}" ${task.status === v ? "selected" : ""}>${t("status." + v)}</option>`)
    .join("");
  const others = project.tasks.filter(x => x.id !== task.id);
  const depsHtml = others.length
    ? others.map(x =>
      `<label class="check"><input type="checkbox" data-dep="${x.id}"
         ${task.depends_on && task.depends_on.includes(x.id) ? "checked" : ""}>
         ${esc(x.name)}</label>`).join("")
    : `<span class="muted small">${t("tasks.noDeps")}</span>`;
  const maxHours = horizon.horizon_slots / 2;

  el.innerHTML = `
  <div class="row wrap" style="gap:20px;margin-bottom:14px">
    <div class="field" style="flex:1;min-width:220px"><label>${t("tasks.name")}</label>
      <input type="text" id="fName" value="${esc(task.name)}" style="width:100%"></div>
    <div class="field"><label>${t("tasks.duration")}</label>
      <input type="number" id="fHours" min="0.5" max="${maxHours}" step="0.5"
             value="${task.minutes / 60}"></div>
    <div class="field"><label>${t("tasks.status")}</label>
      <select id="fStatus">${statusOpts}</select></div>
  </div>
  <div class="row wrap" style="margin-bottom:14px">
    <label class="check"><input type="checkbox" id="fWho" ${task.work_hours_only ? "checked" : ""}>
      ${t("tasks.workHoursOnly", { start: project.calendar.work_start, end: project.calendar.work_end })}</label>
    <label class="check"><input type="checkbox" id="fCont"
      ${task.continue_next_day ? "checked" : ""} ${task.work_hours_only ? "" : "disabled"}>
      ${t("tasks.continueNextDay")}</label>
  </div>
  <div class="row wrap" style="margin-bottom:14px">
    <label class="check"><input type="checkbox" id="fEsOn" ${es ? "checked" : ""}>
      ${t("tasks.earliestStart")}</label>
    <select id="fEsDate" ${es ? "" : "disabled"}>${esDateOpts}</select>
    <select id="fEsTime" ${es ? "" : "disabled"}>${esTimeOpts}</select>
    <span class="muted small">${t("tasks.earliestHint")}</span>
  </div>
  <div class="row wrap" style="margin-bottom:14px">
    <label class="check"><input type="checkbox" id="fDlOn" ${task.deadline ? "checked" : ""}>
      ${t("tasks.deadline")}</label>
    <select id="fDlDate" ${task.deadline ? "" : "disabled"}>${dlDateOpts}</select>
    <select id="fDlTime" ${task.deadline ? "" : "disabled"}>${dlTimeOpts}</select>
    <span class="muted small">${t("tasks.deadlineHint")}</span>
  </div>
  <div class="row wrap" style="margin-bottom:14px">
    <label class="check"><input type="checkbox" id="fPinOn" ${pin ? "checked" : ""}>
      ${t("tasks.pinnedStart")}</label>
    <select id="fPinDate" ${pin ? "" : "disabled"}>${pinDateOpts}</select>
    <select id="fPinTime" ${pin ? "" : "disabled"}>${pinTimeOpts}</select>
    <span class="muted small">${t("tasks.pinnedHint")}</span>
  </div>
  <fieldset><legend>${t("tasks.dependsOn")}</legend>
    <div class="deps-list" id="depsList">${depsHtml}</div>
    <div class="muted small">${t("tasks.dependsHint")}</div>
  </fieldset>
  <fieldset><legend>${t("tasks.resources")}</legend>
    <table id="resTable"><tbody></tbody></table>
    <button id="btnAddRes" class="btn icon small accent" style="margin-top:8px"
      title="${esc(t("tasks.addResource"))}"
      aria-label="${esc(t("tasks.addResource"))}">${icon("plus")}</button>
  </fieldset>
  <fieldset><legend>${t("tasks.slots", { days: horizon.days })}</legend>
    <div class="row wrap" style="margin-bottom:8px">
      <span class="small muted">${t("tasks.paintMode")}</span>
      <div class="paint-seg" role="radiogroup">
        <label><input type="radio" name="paint" value="unavailable" checked>
          <span class="dot du"></span>${t("tasks.unavailable")}</label>
        <label><input type="radio" name="paint" value="preferred">
          <span class="dot dp"></span>${t("tasks.preferred")}</label>
        <label><input type="radio" name="paint" value="">
          <span class="dot dc"></span>${t("tasks.clear")}</label>
      </div>
      <span class="small muted">${t("tasks.paintHint")}</span>
    </div>
    <div class="gridwrap" id="taskGridWrap"></div>
    <div class="legend">
      <span class="lp">${t("legend.preferred")}</span>
      <span class="lu">${t("legend.unavailable")}</span>
      <span class="lw">${t("legend.workHours")}</span>
      <span class="lo">${t("legend.offHours")}</span>
    </div>
  </fieldset>`;

  el.querySelector("#fName").onchange = e => {
    task.name = e.target.value || t("tasks.newName");
    markSave(); renderTaskList();
  };
  el.querySelector("#fHours").onchange = e => {
    let h = parseFloat(e.target.value) || 0.5;
    h = Math.max(0.5, Math.min(maxHours, Math.round(h * 2) / 2));
    task.minutes = Math.round(h * 60);
    e.target.value = h;
    markSave(); renderTaskList();
  };
  el.querySelector("#fWho").onchange = e => {
    task.work_hours_only = e.target.checked;
    if (!task.work_hours_only) task.continue_next_day = false;
    markSave(); renderEditor();
  };
  el.querySelector("#fCont").onchange = e => {
    task.continue_next_day = e.target.checked; markSave();
  };
  const dlSync = () => {
    if (el.querySelector("#fDlOn").checked) {
      task.deadline = {
        date: el.querySelector("#fDlDate").value,
        time: slotHHMM(parseInt(el.querySelector("#fDlTime").value, 10)),
      };
    } else {
      task.deadline = null;
    }
    el.querySelector("#fDlDate").disabled = !task.deadline;
    el.querySelector("#fDlTime").disabled = !task.deadline;
    markSave();
  };
  ["fDlOn", "fDlDate", "fDlTime"].forEach(id => { el.querySelector("#" + id).onchange = dlSync; });
  const esSync = () => {
    if (el.querySelector("#fEsOn").checked) {
      task.earliest_start = {
        date: el.querySelector("#fEsDate").value,
        time: slotHHMM(parseInt(el.querySelector("#fEsTime").value, 10)),
      };
    } else {
      task.earliest_start = null;
    }
    el.querySelector("#fEsDate").disabled = !task.earliest_start;
    el.querySelector("#fEsTime").disabled = !task.earliest_start;
    markSave();
  };
  ["fEsOn", "fEsDate", "fEsTime"].forEach(id => { el.querySelector("#" + id).onchange = esSync; });
  const pinSync = () => {
    if (el.querySelector("#fPinOn").checked) {
      task.pinned_start = {
        date: el.querySelector("#fPinDate").value,
        time: slotHHMM(parseInt(el.querySelector("#fPinTime").value, 10)),
      };
    } else {
      task.pinned_start = null;
    }
    el.querySelector("#fPinDate").disabled = !task.pinned_start;
    el.querySelector("#fPinTime").disabled = !task.pinned_start;
    markSave(); renderTaskList();
  };
  ["fPinOn", "fPinDate", "fPinTime"].forEach(id => {
    el.querySelector("#" + id).onchange = pinSync;
  });
  el.querySelector("#fStatus").onchange = e => {
    task.status = e.target.value;
    markSave(); renderTaskList();
  };
  el.querySelectorAll("#depsList input[data-dep]").forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.dep;
      task.depends_on = task.depends_on || [];
      if (cb.checked) {
        if (!task.depends_on.includes(id)) task.depends_on.push(id);
      } else {
        task.depends_on = task.depends_on.filter(d => d !== id);
      }
      markSave(); renderTaskList();
    };
  });

  renderResRows(el, task);
  buildSlotGrid(el.querySelector("#taskGridWrap"), {
    getState: (dateKey, s) => (task.slots[dateKey] || {})[String(s)] || "",
    setState: (dateKey, s, val) => {
      if (!task.slots[dateKey]) task.slots[dateKey] = {};
      if (val) {
        task.slots[dateKey][String(s)] = val;
      } else {
        delete task.slots[dateKey][String(s)];
        if (!Object.keys(task.slots[dateKey]).length) delete task.slots[dateKey];
      }
      markSave();
    },
    pickValue: e => e.button === 2 ? "preferred" : e.button === 1 ? "" :
      document.querySelector("input[name=paint]:checked").value,
  });
}

function renderResRows(el, task) {
  const tb = el.querySelector("#resTable tbody"); tb.innerHTML = "";
  const entries = Object.entries(task.resources);
  if (!entries.length) {
    tb.innerHTML = `<tr><td class="muted small" style="border:none">
      ${t("tasks.noResources")}</td></tr>`;
  }
  entries.forEach(([name, qty]) => {
    const eqNow = project.equipment.find(e => e.name === name);
    const cap = eqNow ? Math.max(1, eqNow.count) : 99;   // never request more than exist
    const opts = project.equipment.map(e =>
      `<option ${e.name === name ? "selected" : ""} value="${esc(e.name)}"
         ${e.count === 0 && e.name !== name ? "disabled" : ""}>
         ${esc(e.name)} (×${e.count})</option>`).join("");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="border:none"><select>${opts}</select></td>
      <td style="border:none"><input type="number" min="1" max="${cap}" value="${qty}"></td>
      <td style="border:none">${iconBtn("trash", "res.delete", "danger")}</td>`;
    tr.querySelector("select").onchange = e => {
      const nn = e.target.value;
      if (nn !== name && nn in task.resources) {
        toast(t("res.alreadyInList"), "error"); e.target.value = name; return;
      }
      const newEq = project.equipment.find(x => x.name === nn);
      delete task.resources[name];
      task.resources[nn] = Math.min(qty, Math.max(1, newEq ? newEq.count : qty));
      markSave(); renderResRows(el, task);
    };
    tr.querySelector("input").onchange = e => {
      let v = parseInt(e.target.value, 10) || 1;
      if (v > cap) {
        v = cap;
        toast(t("tasks.qtyClamped", { n: cap, name }), "error");
      }
      task.resources[name] = Math.max(1, v);
      e.target.value = task.resources[name]; markSave();
    };
    tr.querySelector("button").onclick = () => {
      delete task.resources[name]; markSave(); renderResRows(el, task);
    };
    tb.appendChild(tr);
  });
  el.querySelector("#btnAddRes").onclick = () => {
    const free = project.equipment.find(e => !(e.name in task.resources) && e.count > 0);
    if (!free) {
      toast(project.equipment.length ? t("res.allAdded") : t("res.defineFirst"), "error");
      return;
    }
    task.resources[free.name] = 1; markSave(); renderResRows(el, task);
  };
}

/* ================= solve ================= */
$("#btnSolve").onclick = async () => {
  const btn = $("#btnSolve");
  const label = btn.querySelector("span[data-i18n]");
  btn.disabled = true; label.textContent = t("app.solving");
  try {
    await saveNow(); // flush pending edits first
    const d = await api(`${P()}/solve`, { method: "POST" });
    project.schedule = d.schedule; horizon = d.horizon;
    activateTab("schedule");
  } catch (e) {
    toast(t("sch.solveFailed", { msg: e.message }), "error");
  } finally {
    btn.disabled = false; label.textContent = t("app.solve");
  }
};

/* ================= schedule: gantt + details + export ================= */
const PALETTE = ["#4c78a8", "#f58518", "#54a24b", "#e45756", "#72b7b2", "#b279a2",
  "#ff9da6", "#9d755d", "#bab0ac", "#d67195", "#86bcb6", "#e0ac2b",
  "#8390fa", "#59a14f", "#c66", "#69c"];

/* Gantt SVG colours per theme (the HTML export is always rendered light) */
const GANTT_COLORS = {
  light: {
    band: "#e6eaf1", off: "#eef1f6", dayline: "#c8ccd2", daytext: "#333",
    holiday: "#dc2626", tick: "#999", rowline: "#eee", gridH: "#d4dae3",
    gridHalf: "#e7eaf0", now: "#dc2626", label: "#333", blocktext: "#fff",
  },
  dark: {
    band: "#232a38", off: "#1f2531", dayline: "#4a5368", daytext: "#d5dbe8",
    holiday: "#f87171", tick: "#8b94a7", rowline: "#2c3342", gridH: "#3d4759",
    gridHalf: "#2c3342", now: "#f87171", label: "#d5dbe8", blocktext: "#fff",
  },
};
const ganttTheme = forExport =>
  GANTT_COLORS[!forExport && document.documentElement.dataset.theme === "dark"
    ? "dark" : "light"];

function scheduleRows() {
  const sc = project.schedule;
  return sc.tasks.map((stt, ti) => {
    const task = project.tasks.find(x => x.id === stt.task_id) || null;
    const segs = stt.segments;
    const minutes = segs.reduce((a, g) => a + (g.end_slot - g.start_slot) * 30, 0);
    let deadline = null, met = null;
    if (task && task.deadline) {
      deadline = new Date(`${task.deadline.date}T${task.deadline.time === "24:00" ? "23:59" : task.deadline.time}`);
      if (task.deadline.time === "24:00") deadline = new Date(deadline.getTime() + 60000);
      met = new Date(segs[segs.length - 1].end) <= deadline;
    }
    return {
      stt, ti, task, minutes, deadline, met,
      start: segs[0].start, end: segs[segs.length - 1].end,
      prio: project.tasks.findIndex(x => x.id === stt.task_id) + 1,
    };
  });
}

function renderSchedule() {
  const st = $("#status"), wrap = $("#ganttwrap"), sc = project.schedule;
  $("#detailsPanel").hidden = true;
  $("#btnExport").disabled = !(sc && sc.status !== "INFEASIBLE" && sc.tasks.length);
  if (!sc) { st.textContent = t("sch.notSolved"); wrap.innerHTML = ""; return; }
  if (sc.status === "INFEASIBLE") {
    st.innerHTML = `<span class="badge bad">INFEASIBLE</span><span>${esc(sc.message)}</span>`;
    wrap.innerHTML = ""; return;
  }
  const stale = sc.horizon_start && sc.horizon_start !== horizon.start_date;
  st.innerHTML = `<span class="badge ok">${esc(sc.status)}</span><span>` +
    esc(t("sch.summary", {
      makespan: fmtHours(sc.makespan_minutes || 0),
      time: sc.solve_time_s, n: sc.tasks.length,
    })) +
    ` <span class="muted">(${esc(t("sch.meta", {
      at: sc.solved_at ? fmtDT(sc.solved_at) : "",
      from: sc.horizon_start ? fmtDateLong(sc.horizon_start) : "",
    }))})</span></span>` +
    (stale ? ` <b class="bad">${esc(t("sch.stale"))}</b>` : "");
  wrap.innerHTML = buildGanttSVG(false);
  attachTooltips(wrap);
  renderDetailsTable();
}

let ganttZoom = 1;
function setZoom(z) {
  const wrap = $("#ganttwrap");
  const old = ganttZoom;
  ganttZoom = Math.min(8, Math.max(0.5, z));
  if (ganttZoom === old) return;
  const cx = wrap.scrollLeft + wrap.clientWidth / 2;   // keep the view centred
  renderSchedule();
  wrap.scrollLeft = cx * (ganttZoom / old) - wrap.clientWidth / 2;
}
$("#btnZoomIn").onclick = () => setZoom(ganttZoom * 1.4);
$("#btnZoomOut").onclick = () => setZoom(ganttZoom / 1.4);
$("#btnZoomFit").onclick = () => setZoom(1);

function buildGanttSVG(forExport) {
  const units = allUnits();
  const HS = horizon.horizon_slots, SPD = horizon.slots_per_day;
  const LEFT = 150, TOP = 46, ROW = 26;
  const wrapW = $("#ganttwrap").clientWidth || 1280;
  const pxs = forExport ? 2.4 : Math.max(1.9, (wrapW - LEFT - 26) / HS) * ganttZoom;
  const hourW = 2 * pxs;  // pixels per hour; drives gridline/label density
  const th = ganttTheme(forExport);
  const W = Math.round(LEFT + HS * pxs + 12), H = TOP + units.length * ROW + 12;
  const sc = project.schedule;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `font-family="Segoe UI,system-ui,sans-serif" font-size="11">`;
  // day bands
  for (let d = 0; d < horizon.days; d++) {
    const x = LEFT + d * SPD * pxs;
    if (isOffDay(d)) {
      s += `<rect x="${x}" y="${TOP}" width="${SPD * pxs}" height="${units.length * ROW}" fill="${th.band}"/>`;
    } else {
      s += `<rect x="${x}" y="${TOP}" width="${horizon.work_start_slot * pxs}" ` +
        `height="${units.length * ROW}" fill="${th.off}"/>`;
      s += `<rect x="${x + horizon.work_end_slot * pxs}" y="${TOP}" ` +
        `width="${(SPD - horizon.work_end_slot) * pxs}" height="${units.length * ROW}" fill="${th.off}"/>`;
    }
    s += `<line x1="${x}" y1="${TOP - 16}" x2="${x}" y2="${H - 10}" stroke="${th.dayline}"/>`;
    const dName = SPD * pxs >= 165 ? dayLabelLong(d) : dayLabel(d); // full name if it fits
    s += `<text x="${x + 4}" y="${TOP - 22}" fill="${horizon.holiday_flags[d] ? th.holiday : th.daytext}" ` +
      `font-weight="600">${esc(dName)}</text>`;
    const labelStep = hourW >= 26 ? 1 : hourW >= 13 ? 3 : 6; // denser labels as you zoom
    for (let h = labelStep; h < 24; h += labelStep) {
      s += `<text x="${LEFT + (d * SPD + h * 2) * pxs}" y="${TOP - 8}" fill="${th.tick}" ` +
        `font-size="9" text-anchor="middle">${h}</text>`;
    }
  }
  // adaptive time gridlines: hours appear when zoomed in, half-hours when zoomed further
  if (hourW >= 8 && units.length) {
    const gridBottom = TOP + units.length * ROW;
    for (let sl = 1; sl < HS; sl++) {
      if (sl % SPD === 0) continue;           // day boundary line already drawn
      const isHour = sl % 2 === 0;
      if (!isHour && hourW < 20) continue;    // half-hour lines need more room
      const x = LEFT + sl * pxs;
      s += `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${gridBottom}" ` +
        `stroke="${isHour ? th.gridH : th.gridHalf}"/>`;
    }
  }
  // unit rows (labels are drawn last, in a scroll-pinned group)
  units.forEach((u, i) => {
    const y = TOP + i * ROW;
    s += `<line x1="${LEFT}" y1="${y}" x2="${W - 10}" y2="${y}" stroke="${th.rowline}"/>`;
  });
  s += `<line x1="${LEFT}" y1="${TOP + units.length * ROW}" x2="${W - 10}" ` +
    `y2="${TOP + units.length * ROW}" stroke="${th.rowline}"/>`;
  // now line
  const nowX = LEFT + horizon.now_slot * pxs;
  s += `<line x1="${nowX}" y1="${TOP - 4}" x2="${nowX}" y2="${H - 10}" stroke="${th.now}" ` +
    `stroke-width="1.5" stroke-dasharray="4 3"/>`;
  s += `<text x="${nowX + 3}" y="${TOP - 8}" fill="${th.now}" font-size="9">${esc(t("sch.now"))}</text>`;
  // task blocks
  sc.tasks.forEach((stt, ti) => {
    const color = PALETTE[ti % PALETTE.length];
    stt.units.forEach(u => {
      const row = units.indexOf(u);
      if (row < 0) return;
      stt.segments.forEach(seg => {
        const x = LEFT + seg.start_slot * pxs, w = (seg.end_slot - seg.start_slot) * pxs;
        const y = TOP + row * ROW + 3;
        s += `<g data-ti="${ti}" data-unit="${esc(u)}">`;
        if (forExport) {
          s += `<title>${esc(stt.task_name)}\n${esc(u)}\n` +
            `${esc(seg.start.replace("T", " "))} → ${esc(seg.end.replace("T", " "))}</title>`;
        }
        s += `<rect x="${x}" y="${y}" width="${w}" height="${ROW - 6}" rx="3" ` +
          `fill="${color}" fill-opacity="0.9"/>`;
        if (w > 40) {
          s += `<text x="${x + 4}" y="${y + ROW / 2 + 1}" fill="${th.blocktext}" font-size="10" ` +
            `style="pointer-events:none">${esc(stt.task_name.slice(0, Math.floor(w / 6)))}</text>`;
        }
        s += "</g>";
      });
    });
  });
  if (forExport) {
    // static export: bake the label column into the SVG (always light)
    s += `<g><rect x="0" y="0" width="${LEFT - 4}" height="${H}" fill="#fff"/>`;
    units.forEach((u, i) => {
      const y = TOP + i * ROW;
      s += `<text x="${LEFT - 12}" y="${y + ROW / 2 + 4}" text-anchor="end" fill="${th.label}">${esc(u)}</text>`;
    });
    s += "</g></svg>";
    return s;
  }
  s += "</svg>";
  // CSS-sticky label column: unit names stay visible while the timeline scrolls
  let labels = `<div class="gantt-sticky"><div class="gantt-labels-col" style="height:${H}px;width:${LEFT - 4}px">`;
  units.forEach((u, i) => {
    labels += `<div class="gantt-label" style="top:${TOP + i * ROW}px;height:${ROW}px">${esc(u)}</div>`;
  });
  labels += "</div></div>";
  return labels + s;
}

function attachTooltips(wrap) {
  const tip = $("#tooltip");
  wrap.querySelectorAll("g[data-ti]").forEach(g => {
    g.addEventListener("mouseenter", () => {
      tip.innerHTML = tooltipHTML(+g.dataset.ti, g.dataset.unit);
      tip.hidden = false;
    });
    g.addEventListener("mousemove", e => {
      const pad = 14;
      const r = tip.getBoundingClientRect();
      let x = e.clientX + pad, y = e.clientY + pad;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
      if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    });
    g.addEventListener("mouseleave", () => { tip.hidden = true; });
  });
}

function tooltipHTML(ti, unit) {
  const row = scheduleRows()[ti];
  const lbl = k => `<span class="tt-label">${t(k)}:</span>`;
  let h = `<h4>${esc(row.stt.task_name)}</h4>`;
  h += `<div>${lbl("tt.units")} ${esc(row.stt.units.join(", "))}` +
    (unit && row.stt.units.length > 1 ? ` <b>(${esc(unit)})</b>` : "") + `</div>`;
  h += `<div>${lbl("tt.start")} ${fmtDT(row.start)}</div>`;
  h += `<div>${lbl("tt.end")} ${fmtDT(row.end)}</div>`;
  h += `<div>${lbl("tt.duration")} ${fmtHours(row.minutes)}</div>`;
  if (row.task && Object.keys(row.task.resources).length) {
    const res = Object.entries(row.task.resources)
      .map(([n, q]) => `${q} × ${esc(n)}`).join(", ");
    h += `<div>${lbl("tt.resources")} ${res}</div>`;
  }
  if (row.deadline) {
    h += `<div>${lbl("tt.deadline")} ${fmtDT(row.deadline)} ` +
      `<b class="${row.met ? "ok" : "bad"}">${t(row.met ? "sch.onTime" : "sch.late")}</b></div>`;
  }
  return h;
}

function renderDetailsTable() {
  const tb = $("#detailsTable tbody"); tb.innerHTML = "";
  const rows = scheduleRows().sort((a, b) => a.start < b.start ? -1 : 1);
  rows.forEach(r => {
    const dl = r.deadline ? fmtDT(r.deadline) : "—";
    const status = r.deadline == null ? `<span class="muted">—</span>` :
      r.met ? `<span class="ok">✓ ${esc(t("sch.onTime"))}</span>` :
        `<span class="bad">✗ ${esc(t("sch.late"))}</span>`;
    const tr = document.createElement("tr");
    const isPinnedHere = r.task && r.task.pinned_start &&
      r.task.pinned_start.date === r.start.slice(0, 10) &&
      r.task.pinned_start.time === r.start.slice(11, 16);
    tr.innerHTML = `<td>${r.prio || "—"}</td>
      <td><span class="task-color" style="background:${PALETTE[r.ti % PALETTE.length]}"></span>${esc(r.stt.task_name)}</td>
      <td>${fmtDT(r.start)}</td><td>${fmtDT(r.end)}</td>
      <td>${fmtHours(r.minutes)}</td>
      <td>${r.stt.units.map(esc).join(", ")}</td>
      <td>${dl}</td><td>${status}</td>
      <td>${r.task ? iconBtn("pin", "sch.pinHere", isPinnedHere ? "accent" : "") : ""}</td>`;
    const pinBtn = tr.querySelector("td:last-child .btn");
    if (pinBtn) {
      pinBtn.onclick = () => {
        if (isPinnedHere) {
          r.task.pinned_start = null;
          toast(t("sch.unpinned"));
        } else {
          r.task.pinned_start = { date: r.start.slice(0, 10), time: r.start.slice(11, 16) };
          toast(t("sch.pinned"), "success");
        }
        markSave(); renderTaskList(); renderEditor(); renderDetailsTable();
      };
    }
    tb.appendChild(tr);
  });
  $("#detailsPanel").hidden = false;
}

function downloadBlob(content, type, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}
const exportStamp = () => (project.schedule.horizon_start || "export").replace(/-/g, "");

$("#btnExport").onclick = e => {
  e.stopPropagation();
  const list = $("#exportList");
  if (!list.hidden) { closeExportList(); return; }
  list.innerHTML = "";
  [["download", "sch.export", exportHTML],
   ["sheet", "sch.exportCsv", exportCSV],
   ["calendar", "sch.exportIcs", exportICS]].forEach(([ic, key, fn]) => {
    const b = document.createElement("button");
    b.className = "export-item"; b.setAttribute("role", "menuitem");
    b.innerHTML = `${icon(ic)}<span>${esc(t(key))}</span>`;
    b.onclick = () => { closeExportList(); fn(); };
    list.appendChild(b);
  });
  list.hidden = false;
  $("#btnExport").setAttribute("aria-expanded", "true");
};
function closeExportList() {
  $("#exportList").hidden = true;
  $("#btnExport").setAttribute("aria-expanded", "false");
}
document.addEventListener("click", e => {
  if (!e.target.closest("#exportMenu")) closeExportList();
});

function exportCSV() {
  const sc = project.schedule; if (!sc || !sc.tasks.length) return;
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const header = [t("sch.colTask"), t("sch.colStart"), t("sch.colEnd"), t("sch.colDuration"),
    t("sch.colUnits"), t("sch.colDeadline"), t("sch.colStatus")];
  const rows = scheduleRows().sort((a, b) => a.start < b.start ? -1 : 1).map(r => [
    r.stt.task_name,
    r.start.replace("T", " "),
    r.end.replace("T", " "),
    fmtHours(r.minutes),
    r.stt.units.join(", "),
    r.task && r.task.deadline ? `${r.task.deadline.date} ${r.task.deadline.time}` : "",
    r.deadline == null ? "" : (r.met ? t("sch.onTime") : t("sch.late")),
  ]);
  const csv = "\ufeff" +  // BOM so Excel opens UTF-8 correctly
    [header, ...rows].map(row => row.map(q).join(",")).join("\r\n") + "\r\n";
  downloadBlob(csv, "text/csv;charset=utf-8", `labplanner-schedule-${exportStamp()}.csv`);
}

function exportICS() {
  const sc = project.schedule; if (!sc || !sc.tasks.length) return;
  const fmt = iso => iso.replace(/[-:]/g, "") + "00";  // floating local time
  const escText = v => String(v).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//LabPlanner//EN", "CALSCALE:GREGORIAN"];
  scheduleRows().forEach(r => {
    r.stt.segments.forEach((seg, i) => {
      const part = r.stt.segments.length > 1 ? ` (${i + 1}/${r.stt.segments.length})` : "";
      lines.push(
        "BEGIN:VEVENT",
        `UID:${r.stt.task_id}-${i}@labplanner`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${fmt(seg.start)}`,
        `DTEND:${fmt(seg.end)}`,
        `SUMMARY:${escText(r.stt.task_name + part)}`,
        `DESCRIPTION:${escText(`${t("tt.units")}: ${r.stt.units.join(", ")}`)}`,
        "END:VEVENT",
      );
    });
  });
  lines.push("END:VCALENDAR");
  downloadBlob(lines.join("\r\n") + "\r\n", "text/calendar;charset=utf-8",
    `labplanner-schedule-${exportStamp()}.ics`);
}

function exportHTML() {
  const sc = project.schedule; if (!sc || !sc.tasks.length) return;
  const svg = buildGanttSVG(true);
  const cols = ["#", "sch.colTask", "sch.colStart", "sch.colEnd", "sch.colDuration",
    "sch.colUnits", "sch.colDeadline", "sch.colStatus"]
    .map(k => `<th>${k === "#" ? "#" : esc(t(k))}</th>`).join("");
  const tmp = document.createElement("tbody");
  tmp.innerHTML = $("#detailsTable tbody").innerHTML;
  tmp.querySelectorAll("tr").forEach(row => row.lastElementChild.remove()); // drop pin column
  const body = tmp.innerHTML;
  const css = `
    body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#101828;margin:24px;background:#fff}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 8px}
    .meta{color:#667085;font-size:12px;margin-bottom:14px}
    .gantt{overflow-x:auto;border:1px solid #e3e7ee;border-radius:8px}
    table{border-collapse:collapse;width:100%;font-size:13px}
    th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #e3e7ee;white-space:nowrap}
    th{font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.05em}
    .task-color{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px}
    .ok{color:#16a34a;font-weight:600}.bad{color:#dc2626;font-weight:600}.muted{color:#667085}
    @media print{.gantt{border:none}}`;
  const html = `<!DOCTYPE html>
<html lang="${LANG}"><head><meta charset="utf-8">
<title>${esc(t("sch.exportTitle"))} — ${esc(sc.horizon_start || "")}</title>
<style>${css}</style></head><body>
<h1>${esc(t("sch.exportTitle"))}</h1>
<div class="meta">${esc(t("sch.meta", {
    at: sc.solved_at ? fmtDT(sc.solved_at) : "",
    from: sc.horizon_start ? fmtDateLong(sc.horizon_start) : "",
  }))}
 · ${esc(t("sch.exportedAt", { at: fmtDT(new Date()) }))}</div>
<div class="gantt">${svg}</div>
<h2>${esc(t("sch.details"))}</h2>
<table><thead><tr>${cols}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
  downloadBlob(html, "text/html", `labplanner-schedule-${exportStamp()}.html`);
}

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (document.body.classList.contains("tab-schedule")) renderSchedule();
  }, 150);
});

/* ================= boot ================= */
function renderAll() {
  applyI18n();
  renderLangMenu();
  renderProjectLabel();
  renderResources();
  renderUnitPanel();
  renderWorkCalendar();
  renderTaskList();
  renderEditor();
  renderSchedule();
}
window.renderAll = renderAll;

async function loadVersion() {
  try {
    const d = await api("/api/health");
    $("#footVersion").textContent = "v" + d.version;
  } catch (_) { /* footer just stays without a version */ }
}

async function loadProjects() {
  projectList = (await api("/api/projects")).projects;
  if (!projectList.length) {  // e.g. the last project was just deleted
    await api("/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    projectList = (await api("/api/projects")).projects;
  }
  if (!currentPid || !projectList.some(p => p.id === currentPid)) {
    currentPid = projectList[0].id;
  }
  localStorage.setItem("labplanner.pid", currentPid);
}

async function loadCurrent() {
  const d = await api(P());
  project = d.project; horizon = d.horizon;
  if (!project.tasks.some(x => x.id === selectedId)) {
    selectedId = project.tasks.length ? project.tasks[0].id : null;
  }
  histReset();
  window.__appReady = true;
  renderAll();
}

async function load() {
  await loadProjects();
  await loadCurrent();
  loadCountries(); // async, non-blocking
  loadVersion();
  if (!localStorage.getItem("labplanner.onboarded")) showOnboarding(0);
}
(async () => {
  await loadLocales();  // dictionaries must be in place before the first render
  applyI18n();
  renderLangMenu();
  await load();
})().catch(e => {
  document.querySelector("main").insertAdjacentHTML("afterbegin",
    `<div class="panel" style="margin-bottom:16px;color:var(--red)">${esc(e.message)}</div>`);
});
