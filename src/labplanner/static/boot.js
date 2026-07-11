"use strict";
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
  renderInsights();
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
  editorModeFor = null;  // re-derive timing mode for the loaded project
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
