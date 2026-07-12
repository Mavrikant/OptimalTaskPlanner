"use strict";
/* ================= state & core helpers ================= */
let project = null, horizon = null, selectedId = null, selectedUnit = null, saveTimer = null;
let currentPid = localStorage.getItem("optimal-task-planner.pid") || null;
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
  editorModeFor = null;  // re-derive timing mode from the restored data
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

