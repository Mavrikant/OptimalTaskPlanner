"use strict";
/* ================= insights (metrics derived from the solved schedule) ======= */
function computeInsights() {
  const sc = project.schedule;
  const units = allUnits();
  const SPD = horizon.slots_per_day, days = horizon.days;
  const busy = new Map(units.map(u => [u, new Set()]));
  const perDay = new Map(units.map(u => [u, new Array(days).fill(0)]));
  let lastEnd = horizon.now_slot;
  sc.tasks.forEach(stt => stt.units.forEach(u => {
    if (!busy.has(u)) return;
    stt.segments.forEach(seg => {
      lastEnd = Math.max(lastEnd, seg.end_slot);
      for (let s = seg.start_slot; s < seg.end_slot; s++) {
        busy.get(u).add(s);
        const d = Math.floor(s / SPD);
        if (d >= 0 && d < days) perDay.get(u)[d] += 1;
      }
    });
  }));
  const windowSlots = Math.max(1, lastEnd - horizon.now_slot);
  const perUnit = units.map(u => ({
    unit: u, busy: busy.get(u).size, util: busy.get(u).size / windowSlots,
    perDay: perDay.get(u),
  }));
  const typeAgg = project.equipment.map(eq => {
    const us = unitsOf(eq);
    const b = us.reduce((a, u) => a + (busy.get(u) ? busy.get(u).size : 0), 0);
    return { type: eq.name, count: us.length, util: b / (windowSlots * Math.max(1, us.length)) };
  }).filter(x => x.count > 0);
  const rows = scheduleRows();
  const late = rows.filter(r => r.deadline && !r.met);
  const overall = units.length
    ? perUnit.reduce((a, p) => a + p.busy, 0) / (units.length * windowSlots) : 0;
  const busiest = perUnit.slice().sort((a, b) => b.util - a.util)[0] || null;
  const driver = rows.slice().sort((a, b) => (a.end < b.end ? 1 : -1))[0] || null;
  return { perUnit, typeAgg, late, overall, busiest, driver };
}

function renderInsights() {
  const el = $("#insights");
  const sc = project.schedule;
  if (!sc || sc.status === "INFEASIBLE" || !sc.tasks.length) {
    el.innerHTML = `<div class="panel"><div class="empty-state">${esc(t("ins.empty"))}</div></div>`;
    return;
  }
  const m = computeInsights();
  const pct = x => Math.round(x * 100);
  const bar = (label, ratio, val) =>
    `<div class="bar-row"><span class="bar-label">${label}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round(ratio * 100)}%"></span></span>
      <span class="bar-val">${val}</span></div>`;

  const tiles = [
    [fmtHours(sc.makespan_minutes || 0), t("ins.kpiMakespan")],
    [String(sc.tasks.length), t("ins.kpiTasks")],
    [String(m.late.length), t("ins.kpiLate")],
    [pct(m.overall) + "%", t("ins.kpiUtil")],
    [m.busiest ? `${esc(m.busiest.unit)} · ${pct(m.busiest.util)}%` : "—", t("ins.kpiBusiest")],
  ].map(([v, k]) => `<div class="kpi"><div class="kpi-v">${v}</div><div class="kpi-k">${esc(k)}</div></div>`)
    .join("");

  const maxU = Math.max(0.0001, ...m.perUnit.map(p => p.util));
  const unitBars = m.perUnit.slice().sort((a, b) => b.util - a.util).map(p =>
    bar(esc(p.unit), p.util / maxU, `${pct(p.util)}% · ${esc(t("ins.busy", { h: fmtHours(p.busy * 30) }))}`)).join("");
  const typeBars = m.typeAgg.slice().sort((a, b) => b.util - a.util).map(x =>
    bar(`${esc(x.type)} ×${x.count}`, x.util, `${pct(x.util)}%`)).join("");

  const maxDay = Math.max(1, ...m.perUnit.flatMap(p => p.perDay));
  let heat = `<div class="tablewrap"><table class="heat"><thead><tr><th></th>` +
    [...Array(horizon.days)].map((_, d) => `<th>${esc(dayLabel(d))}</th>`).join("") + `</tr></thead><tbody>`;
  m.perUnit.forEach(p => {
    heat += `<tr><td class="hlabel">${esc(p.unit)}</td>` + p.perDay.map(c =>
      `<td class="hcell" style="--r:${(c / maxDay).toFixed(3)}" ` +
      `title="${esc(p.unit)} · ${esc(fmtHours(c * 30))}">${c ? c / 2 : ""}</td>`).join("") + `</tr>`;
  });
  heat += `</tbody></table></div>`;

  const bl = [];
  if (m.typeAgg.length) {
    const top = m.typeAgg.slice().sort((a, b) => b.util - a.util)[0];
    bl.push(t("ins.tightest", { name: top.type, pct: pct(top.util) }));
  }
  if (m.driver) bl.push(t("ins.driver", { name: m.driver.stt.task_name, at: fmtDT(m.driver.end) }));
  if (m.late.length) {
    m.late.slice(0, 6).forEach(r => bl.push(t("ins.lateBy", {
      name: r.stt.task_name, amount: fmtHours((new Date(r.end) - r.deadline) / 60000),
    })));
  } else {
    bl.push(t("ins.noLate"));
  }

  el.innerHTML = `
    <div class="kpi-row">${tiles}</div>
    <div class="ins-grid">
      <div class="panel"><div class="panel-head"><h2>${esc(t("ins.byUnit"))}</h2>
        <button id="btnInfoInsights" class="btn icon ghost" data-i18n-title="info.title">${icon("info")}</button>
        </div><div class="bars">${unitBars}</div></div>
      <div class="panel"><h2>${esc(t("ins.byType"))}</h2><div class="bars">${typeBars}</div></div>
    </div>
    <div class="panel"><h2>${esc(t("ins.heatmap"))}</h2>${heat}</div>
    <div class="panel"><h2>${esc(t("ins.bottlenecks"))}</h2>
      <ul class="ins-list">${bl.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  const info = $("#btnInfoInsights");
  if (info) { info.title = t("info.title"); info.onclick = () => infoModal("info.insights"); }
}

function downloadBlob(content, type, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}
const exportStamp = () => (project.schedule.horizon_start || "export").replace(/-/g, "");

$("#btnExport").onclick = () => exportHTML();

// CSS the exported viewer needs so the Gantt renders exactly like the app
// (light theme, concrete colours — the export is standalone).
const EXPORT_GANTT_CSS = `
#ganttwrap{overflow:auto;background:#fff;border:1px solid #e3e7ee;border-radius:10px;
  box-shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.1);max-height:72vh;min-height:120px}
#ganttwrap svg{display:block}
.gantt-sticky{position:sticky;left:0;width:0;height:0;z-index:5}
.gantt-labels-col{position:relative;background:#fff;border-right:1px solid #e3e7ee;
  box-shadow:2px 0 5px rgba(16,24,40,.05)}
.gantt-label{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:flex-end;
  padding-right:12px;font-size:11px;color:#101828;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tooltip{position:fixed;z-index:100;background:#1c2333;color:#f2f5fa;padding:10px 12px;border-radius:8px;
  font-size:12px;line-height:1.55;box-shadow:0 8px 24px rgba(16,24,40,.16);max-width:340px;pointer-events:none}
.tooltip h4{margin:0 0 4px;font-size:13px}
.tooltip .tt-label{color:#9aa4b8;margin-right:4px}
.tooltip .ok{color:#4ade80}.tooltip .bad{color:#f87171}`;

/* Serialise the live Gantt renderer + its data so the exported file draws and
   zooms with the exact same code as the Schedule tab (no behaviour drift). */
function ganttViewerScript() {
  const sc = project.schedule;
  const need = ["sch.now", "tt.units", "tt.start", "tt.end", "tt.duration",
    "tt.resources", "tt.deadline", "sch.onTime", "sch.late", "unit.hours"];
  const dict = {}; need.forEach(k => { dict[k] = t(k); });
  const jsonSafe = o => JSON.stringify(o).replace(/</g, "\\u003c");
  const deps = {
    esc, slotHHMM, locale, fmtDT, dayLabel, dayLabelLong, fmtHours,
    isOffDay, isWork, autoUnitNames, unitsOf, allUnits, scheduleRows,
    buildGanttSVG, attachTooltips, tooltipHTML,
  };
  let src = "";
  src += `var LANG=${jsonSafe(LANG)},I18N={${jsonSafe(LANG)}:${jsonSafe(dict)}};\n`;
  src += `var project={equipment:${jsonSafe(project.equipment)},tasks:${jsonSafe(project.tasks)},` +
    `schedule:${jsonSafe(sc)}};\n`;
  src += `var horizon=${jsonSafe(horizon)};\n`;
  src += `var PALETTE=${jsonSafe(PALETTE)},GANTT_COLORS=${jsonSafe(GANTT_COLORS)},ganttZoom=1;\n`;
  src += `var $=function(s){return document.querySelector(s);};\n`;
  src += `function t(k,vars){var s=(I18N[LANG]&&I18N[LANG][k])||k;` +
    `if(vars)for(var kk in vars)s=s.split('{'+kk+'}').join(vars[kk]);return s;}\n`;
  src += `var ganttTheme=function(){return GANTT_COLORS.light;};\n`;  // export is always light
  for (const [name, fn] of Object.entries(deps)) src += `var ${name}=(${fn.toString()});\n`;
  src += `function redraw(){var w=$("#ganttwrap");w.innerHTML=buildGanttSVG(false);attachTooltips(w);}\n`;
  src += `function setZoom(z){var w=$("#ganttwrap"),old=ganttZoom;` +
    `ganttZoom=Math.min(8,Math.max(0.5,z));if(ganttZoom===old)return;` +
    `var cx=w.scrollLeft+w.clientWidth/2;redraw();w.scrollLeft=cx*(ganttZoom/old)-w.clientWidth/2;}\n`;
  src += `window.zIn=function(){setZoom(ganttZoom*1.4);};window.zOut=function(){setZoom(ganttZoom/1.4);};` +
    `window.zFit=function(){ganttZoom=1;redraw();};\n`;
  src += `$("#ganttwrap").addEventListener('wheel',function(e){if(e.ctrlKey||e.metaKey){` +
    `e.preventDefault();setZoom(ganttZoom*(e.deltaY<0?1.1:1/1.1));}},{passive:false});\n`;
  src += `redraw();window.addEventListener('resize',function(){if(ganttZoom===1)redraw();});\n`;
  return src;
}

function exportHTML() {
  const sc = project.schedule; if (!sc || !sc.tasks.length) return;
  const cols = ["#", "sch.colTask", "sch.colStart", "sch.colEnd", "sch.colDuration",
    "sch.colUnits", "sch.colDeadline", "sch.colStatus"]
    .map(k => `<th>${k === "#" ? "#" : esc(t(k))}</th>`).join("");
  const tmp = document.createElement("tbody");
  tmp.innerHTML = $("#detailsTable tbody").innerHTML;
  tmp.querySelectorAll("tr").forEach(row => row.lastElementChild.remove()); // drop pin column
  const body = tmp.innerHTML;
  const zbtn = (ic, key, fn) =>
    `<button class="btn icon" onclick="${fn}" title="${esc(t(key))}" aria-label="${esc(t(key))}">${icon(ic)}</button>`;
  const css = `
    body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#101828;margin:24px;background:#f3f5f9}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 8px}
    .meta{color:#667085;font-size:12px;margin-bottom:14px}
    .schedule-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
    .btn.icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;
      border:1px solid #c9d1dc;border-radius:8px;background:#fff;cursor:pointer;color:#101828;padding:0}
    .btn.icon:hover{background:#f4f6fa}
    .btn.icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;
      stroke-linecap:round;stroke-linejoin:round}
    .zoom-group{display:flex}.zoom-group .btn{border-radius:0}
    .zoom-group .btn:first-child{border-radius:8px 0 0 8px}.zoom-group .btn:last-child{border-radius:0 8px 8px 0}
    .zoom-group .btn+.btn{border-left:none}
    .hint{color:#667085;font-size:12px;margin-left:6px}
    ${EXPORT_GANTT_CSS}
    table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
    th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #e3e7ee;white-space:nowrap}
    th{font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.05em}
    .task-color{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px}
    .ok{color:#16a34a;font-weight:600}.bad{color:#dc2626;font-weight:600}.muted{color:#667085}
    @media print{.schedule-head{display:none}#ganttwrap{border:none;max-height:none;overflow:visible}}`;
  const html = `<!DOCTYPE html>
<html lang="${LANG}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t("sch.exportTitle"))} — ${esc(sc.horizon_start || "")}</title>
<style>${css}</style></head><body>
<h1>${esc(t("sch.exportTitle"))}</h1>
<div class="meta">${esc(t("sch.meta", {
    at: sc.solved_at ? fmtDT(sc.solved_at) : "",
    from: sc.horizon_start ? fmtDateLong(sc.horizon_start) : "",
  }))}
 · ${esc(t("sch.exportedAt", { at: fmtDT(new Date()) }))}</div>
<div class="schedule-head">
  <div class="zoom-group" role="group">
    ${zbtn("zoomOut", "sch.zoomOut", "zOut()")}
    ${zbtn("fit", "sch.zoomFit", "zFit()")}
    ${zbtn("zoomIn", "sch.zoomIn", "zIn()")}
  </div>
  <span class="hint">${esc(t("sch.zoomHint"))}</span>
</div>
<div id="ganttwrap"></div>
<div id="tooltip" class="tooltip" hidden></div>
<h2>${esc(t("sch.details"))}</h2>
<table><thead><tr>${cols}</tr></thead><tbody>${body}</tbody></table>
<script>${ganttViewerScript()}</script>
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

