"use strict";
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

