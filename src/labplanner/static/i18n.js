"use strict";
/* Multilingual UI layer. Every user-visible string lives in I18N.
   To add a language: append an entry to LANGUAGES (code, native name, flag SVG)
   and a full dictionary to I18N (see CONTRIBUTING.md). */

const LANGUAGES = [
  {
    code: "en", name: "English",
    flag: '<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#012169"/>' +
      '<path d="M0,0 30,20 M30,0 0,20" stroke="#fff" stroke-width="4"/>' +
      '<path d="M0,0 30,20 M30,0 0,20" stroke="#C8102E" stroke-width="2"/>' +
      '<path d="M15,0 V20 M0,10 H30" stroke="#fff" stroke-width="6"/>' +
      '<path d="M15,0 V20 M0,10 H30" stroke="#C8102E" stroke-width="3.6"/></svg>',
  },
  {
    code: "tr", name: "Türkçe",
    flag: '<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#E30A17"/>' +
      '<circle cx="11.5" cy="10" r="5" fill="#fff"/><circle cx="12.8" cy="10" r="4" fill="#E30A17"/>' +
      '<polygon fill="#fff" points="17.2,7.2 17.85,9.11 19.86,9.13 18.25,10.34 18.85,12.27 ' +
      '17.2,11.1 15.55,12.27 16.15,10.34 14.54,9.13 16.55,9.11"/></svg>',
  },
];

const I18N = {
  en: {
    "app.subtitle": "Optimal lab scheduling with CP-SAT",
    "app.solve": "Solve schedule",
    "app.solving": "Solving…",
    "tabs.resources": "Resources",
    "tabs.tasks": "Tasks",
    "tabs.schedule": "Schedule",
    "save.saving": "Saving…",
    "save.saved": "Saved",
    "save.failed": "Save failed",

    "res.pool": "Equipment pool",
    "res.addEquipment": "Add equipment",
    "res.empty": "No equipment yet — add your first device.",
    "res.exportPool": "Export",
    "res.importPool": "Import",
    "res.colType": "Equipment type",
    "res.colUnits": "Units",
    "res.edit": "Edit",
    "res.delete": "Delete",
    "res.poolSummary": "{types} types · {units} physical units",
    "res.workCalendar": "Working calendar",
    "res.workStart": "Work start",
    "res.workEnd": "Work end",
    "res.holidays": "Public holidays",
    "res.add": "Add",
    "res.noHolidays": "No holidays defined.",
    "res.autofill": "Auto-fill from country",
    "res.fill": "Fill",
    "res.holidaysAdded": "{n} holiday(s) added.",
    "res.unitAvailability": "Unit availability",
    "res.clearUnit": "Clear all",
    "res.availHint": "Paint the slots when this unit is out of service (maintenance, calibration, booked elsewhere). The solver never assigns the unit during painted slots.",
    "res.noUnits": "Define equipment to manage unit availability.",
    "res.alreadyInList": "Already in the list.",
    "res.allAdded": "All equipment types already added.",
    "res.defineFirst": "Define equipment first (Resources tab).",
    "eq.modalNew": "Add equipment",
    "eq.modalEdit": "Edit equipment",
    "eq.name": "Equipment type name",
    "eq.count": "Number of units",
    "eq.nameExists": "This name already exists.",
    "eq.unitNames": "Unit names",
    "eq.unitNamesHint": "Optional — give each physical unit its own name (e.g. serial number or brand). Leave empty for automatic numbering.",
    "eq.unitNamesInvalid": "Unit names must be unique and non-empty.",
    "eq.unitNamesTaken": "A unit name collides with another equipment type.",
    "eq.deleteTitle": "Delete equipment",
    "eq.deleteConfirm": "Delete '{name}'?",
    "eq.usedByTasks": "'{name}' is used by {n} task(s). Delete anyway?",
    "import.invalid": "Not a valid equipment pool JSON.",
    "import.done": "Equipment pool imported.",
    "holiday.loadFailed": "Could not load holidays: {msg}",
    "workhours.invalid": "Work start must be before work end.",

    "legend.unavailable": "Unavailable",
    "legend.preferred": "Preferred",
    "legend.workHours": "Work hours",
    "legend.offHours": "Off hours / weekend / holiday",

    "tasks.add": "Add task",
    "tasks.duplicate": "Duplicate task",
    "tasks.delete": "Delete task",
    "tasks.priorityHint": "Drag rows to reorder — top = highest priority.",
    "tasks.none": "No task selected.",
    "tasks.empty": "No tasks yet — add your first task.",
    "tasks.newName": "New task",
    "tasks.copySuffix": "(copy)",
    "tasks.name": "Task name",
    "tasks.duration": "Duration (hours)",
    "tasks.workHoursOnly": "Work hours only ({start}–{end})",
    "tasks.continueNextDay": "Continue on next day",
    "tasks.deadline": "Deadline",
    "tasks.deadlineHint": "task must finish by this time",
    "tasks.earliestStart": "Earliest start",
    "tasks.earliestHint": "task may not start before this time",
    "tasks.resources": "Required resources",
    "tasks.addResource": "Add resource",
    "tasks.noResources": "No resources required.",
    "tasks.slots": "Time slots — next {days} days",
    "tasks.paintMode": "Paint mode:",
    "tasks.unavailable": "Unavailable",
    "tasks.preferred": "Preferred",
    "tasks.clear": "Clear",
    "tasks.paintHint": "drag to paint · right-click = preferred · middle-click = clear",
    "tasks.deleteConfirm": "Delete task '{name}'?",

    "sch.export": "Export HTML",
    "sch.zoomIn": "Zoom in",
    "sch.zoomOut": "Zoom out",
    "sch.zoomFit": "Fit to width",
    "sch.details": "Schedule details",
    "sch.colTask": "Task",
    "sch.colStart": "Start",
    "sch.colEnd": "End",
    "sch.colDuration": "Duration",
    "sch.colUnits": "Assigned units",
    "sch.colDeadline": "Deadline",
    "sch.colStatus": "Status",
    "sch.notSolved": "Not solved yet. Press “Solve schedule”.",
    "sch.summary": "makespan {makespan} · solved in {time}s · {n} task(s)",
    "sch.meta": "solved {at} · horizon from {from}",
    "sch.stale": "Schedule is stale (horizon has moved) — re-solve.",
    "sch.onTime": "On time",
    "sch.late": "Misses deadline",
    "sch.solveFailed": "Solve failed: {msg}",
    "sch.exportTitle": "LabPlanner schedule",
    "sch.exportedAt": "Exported {at}",
    "sch.now": "now",

    "tt.units": "Units",
    "tt.start": "Start",
    "tt.end": "End",
    "tt.duration": "Duration",
    "tt.resources": "Resources",
    "tt.deadline": "Deadline",

    "modal.ok": "OK",
    "modal.cancel": "Cancel",
    "modal.delete": "Delete",
    "unit.hours": "h",
    "lang.label": "Language",
    "footer.tagline": "Open-source optimal lab scheduling",
    "footer.powered": "Built with OR-Tools CP-SAT & FastAPI",
    "footer.license": "MIT License",
  },

  tr: {
    "app.subtitle": "CP-SAT ile optimal laboratuvar planlama",
    "app.solve": "Planı çöz",
    "app.solving": "Çözülüyor…",
    "tabs.resources": "Kaynaklar",
    "tabs.tasks": "Görevler",
    "tabs.schedule": "Çizelge",
    "save.saving": "Kaydediliyor…",
    "save.saved": "Kaydedildi",
    "save.failed": "Kaydetme başarısız",

    "res.pool": "Ekipman havuzu",
    "res.addEquipment": "Ekipman ekle",
    "res.empty": "Henüz ekipman yok — ilk cihazınızı ekleyin.",
    "res.exportPool": "Dışa aktar",
    "res.importPool": "İçe aktar",
    "res.colType": "Ekipman tipi",
    "res.colUnits": "Adet",
    "res.edit": "Düzenle",
    "res.delete": "Sil",
    "res.poolSummary": "{types} tip · {units} fiziksel birim",
    "res.workCalendar": "Çalışma takvimi",
    "res.workStart": "Mesai başlangıcı",
    "res.workEnd": "Mesai bitişi",
    "res.holidays": "Resmi tatiller",
    "res.add": "Ekle",
    "res.noHolidays": "Tanımlı tatil yok.",
    "res.autofill": "Ülkeye göre otomatik doldur",
    "res.fill": "Doldur",
    "res.holidaysAdded": "{n} tatil eklendi.",
    "res.unitAvailability": "Birim uygunluk takvimi",
    "res.clearUnit": "Tümünü temizle",
    "res.availHint": "Bu birimin hizmet dışı olduğu saatleri boyayın (bakım, kalibrasyon, başka yerde rezerve). Çözücü boyalı saatlerde bu birimi hiçbir göreve atamaz.",
    "res.noUnits": "Birim uygunluğu için önce ekipman tanımlayın.",
    "res.alreadyInList": "Zaten listede.",
    "res.allAdded": "Tüm ekipman tipleri zaten eklendi.",
    "res.defineFirst": "Önce ekipman tanımlayın (Kaynaklar sekmesi).",
    "eq.modalNew": "Ekipman ekle",
    "eq.modalEdit": "Ekipmanı düzenle",
    "eq.name": "Ekipman tipi adı",
    "eq.count": "Birim sayısı",
    "eq.nameExists": "Bu ad zaten var.",
    "eq.unitNames": "Birim adları",
    "eq.unitNamesHint": "İsteğe bağlı — her fiziksel birime kendi adını verin (örn. seri no veya marka). Otomatik numaralandırma için boş bırakın.",
    "eq.unitNamesInvalid": "Birim adları benzersiz ve dolu olmalı.",
    "eq.unitNamesTaken": "Bir birim adı başka bir ekipman tipiyle çakışıyor.",
    "eq.deleteTitle": "Ekipmanı sil",
    "eq.deleteConfirm": "'{name}' silinsin mi?",
    "eq.usedByTasks": "'{name}' {n} görevde kullanılıyor. Yine de silinsin mi?",
    "import.invalid": "Geçerli bir ekipman havuzu JSON'u değil.",
    "import.done": "Ekipman havuzu içe aktarıldı.",
    "holiday.loadFailed": "Tatiller yüklenemedi: {msg}",
    "workhours.invalid": "Mesai başlangıcı bitişten önce olmalı.",

    "legend.unavailable": "Müsait değil",
    "legend.preferred": "Tercih edilen",
    "legend.workHours": "Mesai saatleri",
    "legend.offHours": "Mesai dışı / hafta sonu / tatil",

    "tasks.add": "Görev ekle",
    "tasks.duplicate": "Görevi kopyala",
    "tasks.delete": "Görevi sil",
    "tasks.priorityHint": "Sıralamak için satırları sürükleyin — en üst = en yüksek öncelik.",
    "tasks.none": "Görev seçilmedi.",
    "tasks.empty": "Henüz görev yok — ilk görevinizi ekleyin.",
    "tasks.newName": "Yeni görev",
    "tasks.copySuffix": "(kopya)",
    "tasks.name": "Görev adı",
    "tasks.duration": "Süre (saat)",
    "tasks.workHoursOnly": "Sadece mesai saatleri ({start}–{end})",
    "tasks.continueNextDay": "Ertesi gün devam et",
    "tasks.deadline": "Termin",
    "tasks.deadlineHint": "görev bu zamana kadar bitmeli",
    "tasks.earliestStart": "En erken başlangıç",
    "tasks.earliestHint": "görev bu zamandan önce başlayamaz",
    "tasks.resources": "Gerekli kaynaklar",
    "tasks.addResource": "Kaynak ekle",
    "tasks.noResources": "Kaynak gerekmiyor.",
    "tasks.slots": "Zaman aralıkları — önümüzdeki {days} gün",
    "tasks.paintMode": "Boyama modu:",
    "tasks.unavailable": "Müsait değil",
    "tasks.preferred": "Tercih edilen",
    "tasks.clear": "Temizle",
    "tasks.paintHint": "boyamak için sürükleyin · sağ tık = tercih · orta tık = temizle",
    "tasks.deleteConfirm": "'{name}' görevi silinsin mi?",

    "sch.export": "HTML dışa aktar",
    "sch.zoomIn": "Yakınlaştır",
    "sch.zoomOut": "Uzaklaştır",
    "sch.zoomFit": "Genişliğe sığdır",
    "sch.details": "Çizelge detayları",
    "sch.colTask": "Görev",
    "sch.colStart": "Başlangıç",
    "sch.colEnd": "Bitiş",
    "sch.colDuration": "Süre",
    "sch.colUnits": "Atanan birimler",
    "sch.colDeadline": "Termin",
    "sch.colStatus": "Durum",
    "sch.notSolved": "Henüz çözülmedi. “Planı çöz” düğmesine basın.",
    "sch.summary": "toplam süre {makespan} · {time} sn'de çözüldü · {n} görev",
    "sch.meta": "çözüm {at} · ufuk başlangıcı {from}",
    "sch.stale": "Çizelge güncel değil (ufuk kaydı) — yeniden çözün.",
    "sch.onTime": "Zamanında",
    "sch.late": "Termini kaçırıyor",
    "sch.solveFailed": "Çözüm başarısız: {msg}",
    "sch.exportTitle": "LabPlanner çizelgesi",
    "sch.exportedAt": "Dışa aktarım: {at}",
    "sch.now": "şimdi",

    "tt.units": "Birimler",
    "tt.start": "Başlangıç",
    "tt.end": "Bitiş",
    "tt.duration": "Süre",
    "tt.resources": "Kaynaklar",
    "tt.deadline": "Termin",

    "modal.ok": "Tamam",
    "modal.cancel": "İptal",
    "modal.delete": "Sil",
    "unit.hours": "sa",
    "lang.label": "Dil",
    "footer.tagline": "Açık kaynak optimal laboratuvar planlama",
    "footer.powered": "OR-Tools CP-SAT ve FastAPI ile geliştirildi",
    "footer.license": "MIT Lisansı",
  },
};

let LANG = localStorage.getItem("labplanner.lang") ||
  ((navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en");
if (!I18N[LANG]) LANG = "en";

function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split("{" + k + "}").join(v);
  return s;
}

function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const v = t(el.dataset.i18nTitle);
    el.title = v;
    el.setAttribute("aria-label", v);
  });
}

function setLang(lang) {
  if (!I18N[lang]) return;
  LANG = lang;
  localStorage.setItem("labplanner.lang", lang);
  applyI18n();
  if (typeof renderAll === "function" && window.__appReady) renderAll();
}
