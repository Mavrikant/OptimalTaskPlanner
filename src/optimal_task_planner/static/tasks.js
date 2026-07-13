"use strict";
/* ================= task list ================= */
let taskFilter = "";

function renderTaskList() {
  const ul = $("#taskList"); ul.innerHTML = "";
  if (!project.tasks.length) {
    ul.innerHTML = `<li class="empty-state" style="cursor:default">${esc(t("tasks.empty"))}</li>`;
    return;
  }
  const q = taskFilter.trim().toLowerCase();
  const visible = q ? project.tasks.filter(x => x.name.toLowerCase().includes(q)) : project.tasks;
  if (!visible.length) {
    ul.innerHTML = `<li class="empty-state" style="cursor:default">` +
      `${esc(t("tasks.filterEmpty", { query: taskFilter.trim() }))}</li>`;
    return;
  }
  visible.forEach(task => {
    const i = project.tasks.indexOf(task); // true priority position, not the filtered index
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
$("#taskFilter").oninput = e => { taskFilter = e.target.value; renderTaskList(); };
$("#btnAddTask").onclick = () => {
  const task = {
    id: uuid(), name: t("tasks.newName"), minutes: 120,
    work_hours_only: false, continue_next_day: false,
    deadline: null, earliest_start: null, pinned_start: null,
    depends_on: [], status: "pending", resources: {}, slots: {},
  };
  project.tasks.push(task); selectedId = task.id;
  taskFilter = ""; $("#taskFilter").value = ""; // otherwise the new task may not match
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
/* Timing is one exclusive mode derived from the data model, so earliest/
   deadline (a window) and pinned start (a fixed point) can never conflict. */
let editorMode = "free", editorModeFor = null;
function currentTimingMode(task) {
  if (task.pinned_start) return "fixed";
  if (task.earliest_start || task.deadline) return "window";
  return "free";
}
function setTimingMode(m) {
  const task = selTask(); if (!task) return;
  editorMode = m; editorModeFor = task.id;
  if (m !== "fixed") task.pinned_start = null;
  if (m !== "window") { task.earliest_start = null; task.deadline = null; }
  if (m === "fixed" && !task.pinned_start) {
    task.pinned_start = { date: horizon.day_dates[0], time: project.calendar.work_start };
  }
  markSave(); renderEditor(); renderTaskList();
}

function renderEditor() {
  const el = $("#editor");
  const task = selTask();
  if (!task) { el.innerHTML = `<div class="muted">${t("tasks.none")}</div>`; return; }

  const dlDateOpts = horizon.day_dates.map((d, i) =>
    `<option value="${d}" ${task.deadline && task.deadline.date === d ? "selected" : ""}>
       ${dayLabelLong(i)}</option>`).join("");
  const dlSlot = task.deadline ? hhmmSlot(task.deadline.time) : 34; // default 17:00
  const dlTimeOpts = Array.from({ length: 49 }, (_, s) =>
    `<option value="${s}" ${s === dlSlot ? "selected" : ""}>${slotHHMM(s)}</option>`).join("");
  const es = task.earliest_start;
  const esDateOpts = horizon.day_dates.map((d, i) =>
    `<option value="${d}" ${es && es.date === d ? "selected" : ""}>
       ${dayLabelLong(i)}</option>`).join("");
  const esSlot = es ? hhmmSlot(es.time) : hhmmSlot(project.calendar.work_start);
  const esTimeOpts = Array.from({ length: 49 }, (_, s) =>
    `<option value="${s}" ${s === esSlot ? "selected" : ""}>${slotHHMM(s)}</option>`).join("");
  const pin = task.pinned_start;
  const pinDateOpts = horizon.day_dates.map((d, i) =>
    `<option value="${d}" ${pin && pin.date === d ? "selected" : ""}>
       ${dayLabelLong(i)}</option>`).join("");
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

  // determine the timing mode: re-derive on task change or when it no longer
  // matches the data (e.g. after undo); an empty "window" is a valid transient
  const derivedMode = currentTimingMode(task);
  if (editorModeFor !== task.id) { editorMode = derivedMode; editorModeFor = task.id; }
  else if (editorMode === "fixed" && !task.pinned_start) editorMode = derivedMode;
  else if (editorMode === "window" && task.pinned_start) editorMode = derivedMode;
  // heal any stale pre-existing conflict (a fixed start clears window bounds)
  if (editorMode === "fixed" && (task.earliest_start || task.deadline)) {
    task.earliest_start = null; task.deadline = null; markSave();
  }
  const seg = (m, key) =>
    `<label><input type="radio" name="timing" value="${m}" ${editorMode === m ? "checked" : ""}>
       ${t(key)}</label>`;
  let timingBody = "";
  if (editorMode === "free") {
    timingBody = `<div class="timing-body"><span class="muted small">${t("tasks.timingFreeHint")}</span></div>`;
  } else if (editorMode === "window") {
    timingBody = `<div class="timing-body">
      <div class="timing-sub">
        <label class="check"><input type="checkbox" id="fEsOn" ${es ? "checked" : ""}>
          ${t("tasks.earliestStart")}</label>
        <select id="fEsDate" ${es ? "" : "disabled"}>${esDateOpts}</select>
        <select id="fEsTime" ${es ? "" : "disabled"}>${esTimeOpts}</select>
      </div>
      <div class="timing-sub">
        <label class="check"><input type="checkbox" id="fDlOn" ${task.deadline ? "checked" : ""}>
          ${t("tasks.deadline")}</label>
        <select id="fDlDate" ${task.deadline ? "" : "disabled"}>${dlDateOpts}</select>
        <select id="fDlTime" ${task.deadline ? "" : "disabled"}>${dlTimeOpts}</select>
      </div>
    </div>`;
  } else {
    timingBody = `<div class="timing-body">
      <div class="timing-sub">
        <select id="fPinDate">${pinDateOpts}</select>
        <select id="fPinTime">${pinTimeOpts}</select>
      </div>
      <span class="muted small">${t("tasks.pinnedHint")}</span>
    </div>`;
  }

  el.innerHTML = `
  <div class="editor-head">
    <div class="field"><label>${t("tasks.name")}</label>
      <input type="text" id="fName" value="${esc(task.name)}" style="width:100%"></div>
    <div class="field compact"><label>${t("tasks.duration")}</label>
      <input type="number" id="fHours" min="0.5" max="${maxHours}" step="0.5"
             value="${task.minutes / 60}"></div>
    <div class="field compact"><label>${t("tasks.status")}</label>
      <select id="fStatus">${statusOpts}</select></div>
  </div>
  <div class="editor-section">
    <div class="editor-grid stretch">
      <div class="constraint toggles">
        <label class="check"><input type="checkbox" id="fWho" ${task.work_hours_only ? "checked" : ""}>
          ${t("tasks.workHoursOnly", { start: project.calendar.work_start, end: project.calendar.work_end })}</label>
        <label class="check"><input type="checkbox" id="fCont"
          ${task.continue_next_day ? "checked" : ""} ${task.work_hours_only ? "" : "disabled"}>
          ${t("tasks.continueNextDay")}</label>
      </div>
      <div class="constraint">
        <div class="constraint-controls" style="justify-content:space-between">
          <span class="section-title">${t("tasks.timing")}</span>
          <div class="seg" role="radiogroup" id="timingSeg">
            ${seg("free", "tasks.timingFree")}${seg("window", "tasks.timingWindow")}${seg("fixed", "tasks.timingFixed")}
          </div>
        </div>
        ${timingBody}
      </div>
    </div>
  </div>
  <div class="editor-section">
    <div class="editor-grid stretch">
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
    </div>
  </div>
  <fieldset class="editor-section"><legend>${t("tasks.slots", { days: horizon.days })}</legend>
    <div class="row wrap" style="margin-bottom:8px">
      <span class="small muted">${t("tasks.paintMode")}</span>
      <div class="seg paint-seg" role="radiogroup">
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
  el.querySelectorAll("#timingSeg input[name=timing]").forEach(r => {
    r.onchange = () => { if (r.checked) setTimingMode(r.value); };
  });
  // window mode: earliest + deadline sub-toggles (present only in that mode)
  const bindWindow = (onId, dateId, timeId, key) => {
    const toggle = el.querySelector("#" + onId);
    if (!toggle) return;
    const sync = () => {
      if (el.querySelector("#" + onId).checked) {
        task[key] = {
          date: el.querySelector("#" + dateId).value,
          time: slotHHMM(parseInt(el.querySelector("#" + timeId).value, 10)),
        };
      } else {
        task[key] = null;
      }
      el.querySelector("#" + dateId).disabled = !task[key];
      el.querySelector("#" + timeId).disabled = !task[key];
      markSave(); renderTaskList();
    };
    [onId, dateId, timeId].forEach(id => { el.querySelector("#" + id).onchange = sync; });
  };
  bindWindow("fDlOn", "fDlDate", "fDlTime", "deadline");
  bindWindow("fEsOn", "fEsDate", "fEsTime", "earliest_start");
  // fixed mode: the pinned start selects are always active (mode is the toggle)
  if (el.querySelector("#fPinDate")) {
    const pinSync = () => {
      task.pinned_start = {
        date: el.querySelector("#fPinDate").value,
        time: slotHHMM(parseInt(el.querySelector("#fPinTime").value, 10)),
      };
      markSave(); renderTaskList();
    };
    ["fPinDate", "fPinTime"].forEach(id => { el.querySelector("#" + id).onchange = pinSync; });
  }
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

