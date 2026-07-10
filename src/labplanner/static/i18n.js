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
    "tasks.qtyClamped": "Only {n} × {name} exist in the pool.",
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

    "ob.tour": "Show intro tour",
    "ob.skip": "Skip tour",
    "ob.back": "Back",
    "ob.next": "Next",
    "ob.start": "Get started",
    "ob.welcome.title": "Welcome to LabPlanner",
    "ob.welcome.body":
      "<p><b>LabPlanner</b> plans your lab work on shared equipment — <b>optimally</b>. " +
      "You describe your devices and tasks; the Google OR-Tools <b>CP-SAT</b> solver " +
      "finds the schedule that finishes everything as early as possible while " +
      "respecting every constraint.</p>" +
      "<p>It runs entirely on your machine: the whole project lives in one local JSON " +
      "file — no accounts, no cloud.</p>",
    "ob.resources.title": "1 · Define your resources",
    "ob.resources.body":
      "<p>Start in the <b>Resources</b> tab:</p><ul>" +
      "<li>Add each <b>equipment type</b> and how many physical units you own " +
      "(e.g. VSG ×3). Units can carry custom names.</li>" +
      "<li>Set your <b>working hours</b> and add <b>public holidays</b> — manually or " +
      "auto-filled by country.</li>" +
      "<li>Paint <b>maintenance windows</b> on individual units; the solver never " +
      "books them during those hours.</li></ul>",
    "ob.tasks.title": "2 · Describe your tasks",
    "ob.tasks.body":
      "<p>In the <b>Tasks</b> tab, create a task for each piece of work:</p><ul>" +
      "<li>Duration in half-hour steps, plus the equipment it needs.</li>" +
      "<li>Optional limits: work-hours-only, earliest start, deadline.</li>" +
      "<li>Paint time slots the task must avoid or should prefer.</li>" +
      "<li>Drag tasks in the list — higher means more important.</li></ul>",
    "ob.schedule.title": "3 · Solve and share",
    "ob.schedule.body":
      "<p>Press <b>Solve schedule</b>. In seconds you get a provably optimal plan:</p><ul>" +
      "<li>A per-unit <b>Gantt chart</b> — zoom in for hour lines, hover for details.</li>" +
      "<li>A table with start, end and deadline status for every task.</li>" +
      "<li><b>Export HTML</b> creates a single-file report you can share.</li></ul>" +
      "<p>Look for the <b>ⓘ</b> buttons around the app for detailed help on each " +
      "section. Have fun!</p>",

    "info.title": "About this section",
    "info.solve.title": "How the schedule is solved",
    "info.solve.body":
      "<p>LabPlanner computes a <b>provably optimal</b> schedule using Google OR-Tools " +
      "<b>CP-SAT</b>. Time is divided into 30-minute slots over the rolling planning " +
      "horizon (today plus the next 13 days).</p>" +
      "<p><b>Hard constraints</b> — every schedule satisfies all of these:</p><ul>" +
      "<li>Each task receives the requested quantity of every equipment type it needs.</li>" +
      "<li>No physical unit serves two tasks in the same time slot.</li>" +
      "<li>Units are never assigned inside their painted out-of-service windows.</li>" +
      "<li>Work-hours-only tasks run within working hours and skip weekends and public " +
      "holidays; “continue on next day” lets them split across days.</li>" +
      "<li>Deadlines, earliest starts and slots painted unavailable are always honoured.</li>" +
      "</ul><p><b>Optimisation goals</b> — applied in strict order of importance:</p><ol>" +
      "<li><b>Makespan:</b> finish all tasks as early as possible.</li>" +
      "<li><b>Preferred slots:</b> place tasks on as many painted preferred slots as possible.</li>" +
      "<li><b>Priority:</b> start tasks nearer the top of the list earlier.</li></ol>" +
      "<p><b>OPTIMAL</b> means no better schedule exists. <b>FEASIBLE</b> means the time " +
      "limit was reached and the best schedule found so far is shown. <b>INFEASIBLE</b> " +
      "means no schedule can satisfy every constraint — the message tells you which task " +
      "or constraint to relax.</p>",
    "info.pool.title": "Equipment pool",
    "info.pool.body":
      "<p>Define every equipment type your lab owns and how many physical units of it " +
      "exist. Type name plus count expand into individual units (e.g. VSG ×3 → " +
      "VSG-1…VSG-3), or give each unit its own name (serial number, brand) while editing " +
      "the type.</p><ul>" +
      "<li>Tasks request equipment by <b>type</b>; the solver picks which specific units " +
      "to use.</li>" +
      "<li>Renaming a type or unit safely carries task references, availability windows " +
      "and the solved schedule along.</li>" +
      "<li>Use the export/import buttons to share a pool between projects as JSON.</li></ul>",
    "info.calendar.title": "Working calendar",
    "info.calendar.body":
      "<p>The working calendar applies to tasks marked <b>work hours only</b>. Other " +
      "tasks may run around the clock.</p><ul>" +
      "<li><b>Work start/end</b> are set in 30-minute steps and take effect immediately.</li>" +
      "<li><b>Public holidays</b> are full days off, like weekends. Add dates manually or " +
      "auto-fill a country's official holidays for a year.</li>" +
      "<li>Holidays inside the horizon are shaded in the grids and the Gantt, with the " +
      "day name shown in red.</li></ul>",
    "info.avail.title": "Unit availability",
    "info.avail.body":
      "<p>Paint the time slots when a specific physical unit is out of service — " +
      "maintenance, calibration, or booked outside LabPlanner.</p><ul>" +
      "<li>Pick a unit, then click or drag over the grid to toggle slots.</li>" +
      "<li>The solver never assigns that unit to any task during painted slots; other " +
      "units of the same type remain usable.</li>" +
      "<li>The eraser button clears every window of the selected unit.</li></ul>",
    "info.tasks.title": "Tasks",
    "info.tasks.body":
      "<p>Each task describes one piece of lab work. The list order sets <b>priority</b>: " +
      "drag rows — the higher a task sits, the earlier the solver tries to start it.</p><ul>" +
      "<li><b>Duration</b> is set in half-hour steps.</li>" +
      "<li><b>Work hours only</b> keeps the task inside the working calendar; enable " +
      "<b>continue on next day</b> for tasks longer than one work day.</li>" +
      "<li><b>Earliest start</b> and <b>deadline</b> bound when the task may run.</li>" +
      "<li><b>Required resources</b> request equipment by type and quantity (limited to " +
      "what the pool holds).</li>" +
      "<li>In the slot grid, paint hours the task must avoid (<b>unavailable</b>) or " +
      "should favour (<b>preferred</b>). Right-click paints preferred, middle-click " +
      "clears.</li></ul>",
    "info.schedule.title": "Reading the schedule",
    "info.schedule.body":
      "<p>Each row is one physical unit; coloured blocks are task reservations. One task " +
      "may occupy several rows at once.</p><ul>" +
      "<li>Grey bands are off-hours, weekends and holidays; the red dashed line marks " +
      "<b>now</b>.</li>" +
      "<li>Hover a block for full details; the table below lists start, end and deadline " +
      "status per task.</li>" +
      "<li>Zoom with the magnifier buttons — hour and half-hour gridlines appear as you " +
      "zoom in; unit names stay pinned while scrolling.</li>" +
      "<li><b>Export HTML</b> downloads a self-contained, shareable one-file report.</li></ul>",
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
    "tasks.qtyClamped": "Havuzda yalnızca {n} adet {name} var.",
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

    "ob.tour": "Tanıtım turunu göster",
    "ob.skip": "Turu atla",
    "ob.back": "Geri",
    "ob.next": "İleri",
    "ob.start": "Başlayalım",
    "ob.welcome.title": "LabPlanner'a hoş geldiniz",
    "ob.welcome.body":
      "<p><b>LabPlanner</b>, ortak ekipman üzerinde yürüyen laboratuvar işlerinizi " +
      "<b>optimal</b> şekilde planlar. Siz cihazlarınızı ve görevlerinizi " +
      "tanımlarsınız; Google OR-Tools <b>CP-SAT</b> çözücüsü tüm kısıtlara uyarak her " +
      "şeyi olabildiğince erken bitiren çizelgeyi bulur.</p>" +
      "<p>Tamamen kendi makinenizde çalışır: tüm proje tek bir yerel JSON dosyasında " +
      "durur — hesap yok, bulut yok.</p>",
    "ob.resources.title": "1 · Kaynaklarınızı tanımlayın",
    "ob.resources.body":
      "<p><b>Kaynaklar</b> sekmesinden başlayın:</p><ul>" +
      "<li>Her <b>ekipman tipini</b> ve kaç fiziksel birim olduğunu ekleyin " +
      "(örn. VSG ×3). Birimlere özel ad verebilirsiniz.</li>" +
      "<li><b>Mesai saatlerinizi</b> ayarlayın, <b>resmi tatilleri</b> ekleyin — elle " +
      "veya ülkeye göre otomatik.</li>" +
      "<li>Birimlerin <b>bakım pencerelerini</b> boyayın; çözücü o saatlerde onları " +
      "asla kullanmaz.</li></ul>",
    "ob.tasks.title": "2 · Görevlerinizi tanımlayın",
    "ob.tasks.body":
      "<p><b>Görevler</b> sekmesinde her iş için bir görev oluşturun:</p><ul>" +
      "<li>Yarım saat adımlı süre ve ihtiyaç duyduğu ekipmanlar.</li>" +
      "<li>İsteğe bağlı sınırlar: sadece mesai, en erken başlangıç, termin.</li>" +
      "<li>Görevin kaçınacağı veya yeğleyeceği saatleri boyayın.</li>" +
      "<li>Listedeki görevleri sürükleyin — üstteki daha önceliklidir.</li></ul>",
    "ob.schedule.title": "3 · Çözün ve paylaşın",
    "ob.schedule.body":
      "<p><b>Planı çöz</b>'e basın. Saniyeler içinde kanıtlanabilir optimal bir plan " +
      "elde edersiniz:</p><ul>" +
      "<li>Birim bazlı <b>Gantt şeması</b> — saat çizgileri için yakınlaşın, ayrıntı " +
      "için üzerine gelin.</li>" +
      "<li>Her görevin başlangıç, bitiş ve termin durumunu gösteren tablo.</li>" +
      "<li>Paylaşabileceğiniz tek dosyalık rapor için <b>HTML dışa aktar</b>.</li></ul>" +
      "<p>Her bölümdeki <b>ⓘ</b> düğmeleri ayrıntılı yardım içerir. İyi çalışmalar!</p>",

    "info.title": "Bu bölüm hakkında",
    "info.solve.title": "Plan nasıl çözülüyor?",
    "info.solve.body":
      "<p>LabPlanner, Google OR-Tools <b>CP-SAT</b> ile <b>kanıtlanabilir şekilde " +
      "optimal</b> bir çizelge hesaplar. Zaman, kayan planlama ufku (bugün + 13 gün) " +
      "boyunca 30 dakikalık dilimlere bölünür.</p>" +
      "<p><b>Katı kısıtlar</b> — her çizelge bunların tümünü sağlar:</p><ul>" +
      "<li>Her görev, ihtiyaç duyduğu her ekipman tipinden istenen adedi alır.</li>" +
      "<li>Hiçbir fiziksel birim aynı zaman diliminde iki göreve hizmet etmez.</li>" +
      "<li>Birimler, boyanan hizmet dışı pencerelerinde asla atanmaz.</li>" +
      "<li>“Sadece mesai saatleri” görevleri çalışma takvimi içinde kalır; hafta sonları " +
      "ve resmi tatiller atlanır. “Ertesi gün devam et” görevi günlere böler.</li>" +
      "<li>Terminler, en erken başlangıçlar ve “müsait değil” boyadığınız saatler her " +
      "zaman korunur.</li></ul>" +
      "<p><b>Optimizasyon hedefleri</b> — kesin öncelik sırasıyla uygulanır:</p><ol>" +
      "<li><b>Toplam süre:</b> tüm görevleri olabildiğince erken bitir.</li>" +
      "<li><b>Tercih edilen saatler:</b> boyanan tercihli saatlerden olabildiğince çok " +
      "kullan.</li>" +
      "<li><b>Öncelik:</b> listede üstteki görevleri daha erken başlat.</li></ol>" +
      "<p><b>OPTIMAL</b>: daha iyi bir çizelge yok. <b>FEASIBLE</b>: süre limitine " +
      "ulaşıldı, o ana dek bulunan en iyi çizelge gösteriliyor. <b>INFEASIBLE</b>: tüm " +
      "kısıtları birlikte sağlayan çizelge yok — mesaj hangi görevi veya kısıtı " +
      "gevşetmeniz gerektiğini söyler.</p>",
    "info.pool.title": "Ekipman havuzu",
    "info.pool.body":
      "<p>Laboratuvarınızdaki her ekipman tipini ve kaç fiziksel birim bulunduğunu " +
      "tanımlayın. Tip adı + adet tek tek birimlere açılır (örn. VSG ×3 → VSG-1…VSG-3); " +
      "dilerseniz tipi düzenlerken her birime kendi adını (seri no, marka) " +
      "verebilirsiniz.</p><ul>" +
      "<li>Görevler ekipmanı <b>tip</b> üzerinden ister; hangi birimlerin " +
      "kullanılacağını çözücü seçer.</li>" +
      "<li>Tip veya birim adını değiştirmek görev referanslarını, uygunluk pencerelerini " +
      "ve çözülmüş çizelgeyi güvenle taşır.</li>" +
      "<li>Havuzu projeler arasında paylaşmak için JSON dışa/içe aktarma düğmelerini " +
      "kullanın.</li></ul>",
    "info.calendar.title": "Çalışma takvimi",
    "info.calendar.body":
      "<p>Çalışma takvimi <b>sadece mesai saatleri</b> işaretli görevlere uygulanır. " +
      "Diğer görevler günün her saatinde çalışabilir.</p><ul>" +
      "<li><b>Mesai başlangıcı/bitişi</b> 30 dakikalık adımlarla ayarlanır ve anında " +
      "geçerli olur.</li>" +
      "<li><b>Resmi tatiller</b> hafta sonları gibi tam gün kapalıdır. Tarihleri elle " +
      "ekleyin veya bir ülkenin resmi tatillerini yıl bazında otomatik doldurun.</li>" +
      "<li>Ufuk içindeki tatiller ızgaralarda ve Gantt'ta gölgelenir, gün adı kırmızı " +
      "gösterilir.</li></ul>",
    "info.avail.title": "Birim uygunluğu",
    "info.avail.body":
      "<p>Belirli bir fiziksel birimin hizmet dışı olduğu saatleri boyayın — bakım, " +
      "kalibrasyon veya LabPlanner dışında rezervasyon.</p><ul>" +
      "<li>Bir birim seçin, ızgarada tıklayıp sürükleyerek saatleri işaretleyin.</li>" +
      "<li>Çözücü boyalı saatlerde o birimi hiçbir göreve atamaz; aynı tipin diğer " +
      "birimleri kullanılabilir kalır.</li>" +
      "<li>Silgi düğmesi seçili birimin tüm pencerelerini temizler.</li></ul>",
    "info.tasks.title": "Görevler",
    "info.tasks.body":
      "<p>Her görev bir laboratuvar işini tanımlar. Liste sırası <b>önceliktir</b>: " +
      "satırları sürükleyin — görev ne kadar üstteyse çözücü onu o kadar erken " +
      "başlatmaya çalışır.</p><ul>" +
      "<li><b>Süre</b> yarım saatlik adımlarla girilir.</li>" +
      "<li><b>Sadece mesai saatleri</b> görevi çalışma takvimi içinde tutar; bir iş " +
      "gününden uzun görevler için <b>ertesi gün devam et</b>'i açın.</li>" +
      "<li><b>En erken başlangıç</b> ve <b>termin</b>, görevin çalışabileceği aralığı " +
      "sınırlar.</li>" +
      "<li><b>Gerekli kaynaklar</b> ekipmanı tip ve adet olarak ister (havuzdaki adetle " +
      "sınırlı).</li>" +
      "<li>Zaman ızgarasında görevin kaçınması gereken saatleri (<b>müsait değil</b>) " +
      "veya yeğlemesi gerekenleri (<b>tercih edilen</b>) boyayın. Sağ tık tercihli " +
      "boyar, orta tık temizler.</li></ul>",
    "info.schedule.title": "Çizelgeyi okuma",
    "info.schedule.body":
      "<p>Her satır bir fiziksel birimdir; renkli bloklar görev rezervasyonlarıdır. Bir " +
      "görev aynı anda birden çok satırı kullanabilir.</p><ul>" +
      "<li>Gri bantlar mesai dışı saatleri, hafta sonlarını ve tatilleri gösterir; " +
      "kırmızı kesikli çizgi <b>şimdi</b>yi işaretler.</li>" +
      "<li>Ayrıntı için bloğun üzerine gelin; alttaki tablo görev başına başlangıç, " +
      "bitiş ve termin durumunu listeler.</li>" +
      "<li>Büyüteç düğmeleriyle yakınlaşın — saat ve yarım saat çizgileri belirir; " +
      "kaydırırken birim adları solda sabit kalır.</li>" +
      "<li><b>HTML dışa aktar</b>, paylaşılabilir tek dosyalık bir rapor indirir.</li></ul>",
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
