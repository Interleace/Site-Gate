const SUPPORTED_LOCALES = [
  { id: "auto", labelKey: "lang.auto" },
  { id: "en", labelKey: "lang.en", native: "English" },
  { id: "de", labelKey: "lang.de", native: "Deutsch" },
  { id: "es", labelKey: "lang.es", native: "Español" },
  { id: "fr", labelKey: "lang.fr", native: "Français" }
];

const FALLBACK_LOCALE = "en";

/** @type {Record<string, string>} */
let messages = {};

/** @type {Record<string, string>} */
let overrides = {};

/** @type {string} */
let activeLocale = FALLBACK_LOCALE;

function detectBrowserLocale() {
  const lang = (navigator.language || FALLBACK_LOCALE).slice(0, 2).toLowerCase();
  return SUPPORTED_LOCALES.some((l) => l.id === lang) ? lang : FALLBACK_LOCALE;
}

async function fetchLocaleBundle(code) {
  const enRes = await fetch(chrome.runtime.getURL("shared/locales/en.json"));
  const en = await enRes.json();
  if (code === "en") return en;
  try {
    const res = await fetch(chrome.runtime.getURL(`shared/locales/${code}.json`));
    const partial = await res.json();
    delete partial._meta;
    return { ...en, ...partial };
  } catch {
    return en;
  }
}

async function initI18n(localePref, userOverrides) {
  overrides = userOverrides || {};
  const code =
    !localePref || localePref === "auto" ? detectBrowserLocale() : localePref;
  try {
    messages = await fetchLocaleBundle(code);
    activeLocale = code;
  } catch {
    messages = await fetchLocaleBundle(FALLBACK_LOCALE);
    activeLocale = FALLBACK_LOCALE;
  }
  document.documentElement.lang = activeLocale;
  return activeLocale;
}

function t(key, params) {
  let str = overrides[key] ?? messages[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.placeholder = t(key);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) el.title = t(key);
  });
  const titleKey = document.body?.dataset?.i18nTitle;
  if (titleKey) document.title = t(titleKey);
}

async function loadI18nSettings() {
  const data = await chrome.storage.sync.get(["gateSettings", "localeOverrides"]);
  const gs = { ...DEFAULT_GATE_SETTINGS, ...(data.gateSettings || {}) };
  return initI18n(gs.locale, data.localeOverrides);
}

function exportLocaleKeys() {
  return { ...messages };
}

function importLocaleOverrides(map) {
  overrides = { ...overrides, ...map };
}
