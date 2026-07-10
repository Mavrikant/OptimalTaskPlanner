"use strict";
/* Multilingual UI layer.

   Dictionaries live in /static/locales/<code>.json — one flat JSON object per
   language. To add a language: create the JSON file (same keys as en.json)
   and append an entry (code, native name, flag SVG) to LANGUAGES below. */

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

const I18N = {};

async function loadLocales() {
  await Promise.all(LANGUAGES.map(async lang => {
    const r = await fetch(`/static/locales/${lang.code}.json`);
    if (!r.ok) throw new Error(`could not load locale ${lang.code}`);
    I18N[lang.code] = await r.json();
  }));
}

let LANG = localStorage.getItem("labplanner.lang") ||
  ((navigator.language || "").toLowerCase().startsWith("tr") ? "tr" : "en");
if (!LANGUAGES.some(lang => lang.code === LANG)) LANG = "en";

function t(key, vars) {
  const dict = I18N[LANG] || {};
  let s = dict[key] || (I18N.en || {})[key] || key;
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
  if (!LANGUAGES.some(l => l.code === lang)) return;
  LANG = lang;
  localStorage.setItem("labplanner.lang", lang);
  applyI18n();
  if (typeof renderAll === "function" && window.__appReady) renderAll();
}
