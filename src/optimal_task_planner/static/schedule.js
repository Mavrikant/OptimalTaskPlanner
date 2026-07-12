"use strict";
/* ================= solve (async job + progress + cancel) ================= */
let solveJob = null, solvePollTimer = null;
// best-so-far schedule while a solve is running — kept separate from
// project.schedule so a cancelled/failed solve leaves the last confirmed
// result in place instead of stranding a half-solved preview there.
let previewSchedule = null;

function setSolveButton(running) {
  const btn = $("#btnSolve");
  btn.querySelector("span[data-icon]").innerHTML = icon(running ? "x" : "play");
  btn.querySelector("span[data-i18n]").textContent = t(running ? "sch.cancel" : "app.solve");
  btn.classList.toggle("primary", !running);
  btn.classList.toggle("danger", running);
}

function showSolveProgress(d) {
  const st = $("#status");
  let html = `<span class="badge">${esc(t("sch.solving", { elapsed: d.elapsed_s }))}</span>`;
  if (d.best_makespan_minutes != null) {
    html += `<span class="muted">${esc(t("sch.bestSoFar",
      { makespan: fmtHours(d.best_makespan_minutes) }))}</span>`;
  }
  st.innerHTML = html;
}

function finishSolve() {
  solveJob = null;
  previewSchedule = null;
  clearTimeout(solvePollTimer); solvePollTimer = null;
  setSolveButton(false);
}

/* Solving runs in the background and can take a while — if the tab isn't
   even visible, a notification is the only way the user finds out it's done. */
function requestNotifyPermission() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  Notification.requestPermission();
}
function notifySolveResult(body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!document.hidden) return; // the status line already shows this — don't double up
  const n = new Notification("Optimal Task Planner", { body });
  n.onclick = () => { window.focus(); n.close(); };
}

function pollSolve() {
  solvePollTimer = setTimeout(async () => {
    if (!solveJob) return;
    let d;
    try {
      d = await api(`/api/solve/${solveJob}`);
    } catch (e) {
      toast(t("sch.solveFailed", { msg: e.message }), "error");
      notifySolveResult(t("sch.solveFailed", { msg: e.message }));
      finishSolve(); renderSchedule(); return;
    }
    if (d.status === "running") {
      showSolveProgress(d);
      if (d.schedule_preview) {
        previewSchedule = { tasks: d.schedule_preview };
        renderSchedule();
      }
      pollSolve();
      return;
    }
    previewSchedule = null;
    if (d.status === "done") {
      project.schedule = d.schedule; horizon = d.horizon;
      notifySolveResult(t("sch.notifyDone", { makespan: fmtHours(d.schedule.makespan_minutes || 0) }));
    } else if (d.status === "cancelled") {
      toast(t("sch.cancelled"));
      notifySolveResult(t("sch.cancelled"));
    } else if (d.status === "error") {
      toast(t("sch.solveFailed", { msg: d.error || "" }), "error");
      notifySolveResult(t("sch.solveFailed", { msg: d.error || "" }));
    }
    finishSolve();
    renderSchedule();
  }, 350);
}

$("#btnSolve").onclick = async () => {
  if (solveJob) {                     // acting as Cancel while a solve runs
    api(`/api/solve/${solveJob}/cancel`, { method: "POST" }).catch(() => {});
    return;
  }
  try {
    await saveNow(); // flush pending edits first
    requestNotifyPermission();
    const d = await api(`${P()}/solve`, { method: "POST" });
    solveJob = d.job_id;
    previewSchedule = null;
    setSolveButton(true);
    activateTab("schedule");
    showSolveProgress({ elapsed_s: 0, best_makespan_minutes: null });
    pollSolve();
  } catch (e) {
    toast(t("sch.solveFailed", { msg: e.message }), "error");
    finishSolve();
  }
};

/* ================= schedule: gantt + details + export ================= */
/* 16 hues evenly rotated from the --accent teal at matched saturation/lightness
   (see AGENTS.md), instead of a generic off-the-shelf categorical palette —
   coordinated with the rest of the UI rather than just "a chart color set". */
const PALETTE = ["#2a9d93", "#2a7c9d", "#2a519d", "#2e2a9d", "#592a9d", "#852a9d",
  "#9d2a8a", "#9d2a5f", "#9d2a34", "#9d4b2a", "#9d762a", "#999d2a",
  "#6e9d2a", "#429d2a", "#2a9d3c", "#2a9d68"];

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
  const sc = previewSchedule || project.schedule;
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
  const st = $("#status"), wrap = $("#ganttwrap"), sc = previewSchedule || project.schedule;
  $("#detailsPanel").hidden = true;
  const reportable = !!(sc && !previewSchedule && sc.status !== "INFEASIBLE" && sc.tasks.length);
  $("#btnExport").disabled = !reportable;
  $("#btnShare").disabled = !reportable;
  if (!sc) { st.textContent = t("sch.notSolved"); wrap.innerHTML = ""; return; }
  if (previewSchedule) {
    // the status line (elapsed time, best makespan so far) belongs to
    // showSolveProgress() while a solve is running — only draw the Gantt body
    wrap.innerHTML = buildGanttSVG(false);
    attachTooltips(wrap);
    return;
  }
  if (sc.status === "INFEASIBLE") {
    const hints = (sc.hints || []).length
      ? `<ul class="hints">${sc.hints.map(h => `<li>${esc(h)}</li>`).join("")}</ul>`
      : "";
    st.innerHTML = `<span class="badge bad">INFEASIBLE</span><span>${esc(sc.message)}</span>${hints}`;
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
  const sc = previewSchedule || project.schedule;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="0 0 ${W} ${H}" font-family="Segoe UI,system-ui,sans-serif" font-size="11">`;
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

