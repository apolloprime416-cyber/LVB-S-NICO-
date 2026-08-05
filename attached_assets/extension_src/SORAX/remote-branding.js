// Fetch live branding (logo, name, color) from the admin panel and apply it.
// Designed to AVOID the orange "flash" on cold start by:
//   1. Hiding the document until cached or fresh branding is applied
//   2. Using chrome.storage.local AND localStorage as caches
//   3. Updating across contexts via chrome.storage.onChanged
(function () {
  var SUPABASE_URL = "https://hyjsaialebpskwfvinig.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anNhaWFsZWJwc2t3ZnZpbmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjEyOTcsImV4cCI6MjEwMDI5NzI5N30.xRzxMfr92xxRxMwgNG_0iz9J2Rc6SQV3fLgVKItJgrg";
  var CACHE_KEY = "ts_branding_cache";

  var isSidepanel = false;
  try {
    isSidepanel = typeof location !== "undefined" &&
      (location.protocol === "chrome-extension:" || location.protocol === "moz-extension:");
  } catch (_) {}

  // Hide the document briefly to avoid color flash (sidepanel/extension pages only).
  var shown = false;
  function showDoc() {
    if (shown) return;
    shown = true;
    try {
      if (document.documentElement) {
        document.documentElement.style.visibility = "";
        document.documentElement.style.opacity = "";
      }
    } catch (_) {}
  }
  if (isSidepanel) {
    try {
      if (document.documentElement) {
        document.documentElement.style.visibility = "visible";
      }
    } catch (_) {}
    // Safety: never hide longer than 2500ms
    showDoc();
  }

  function applyLogo(url) {
    if (!url) return;
    try {
      document.querySelectorAll("img.sp-login-logo").forEach(function (img) {
        img.src = url;
      });
    } catch (_) {}
  }

  function applyAll(s) {
    if (!s) { showDoc(); return; }
    var cfg = {
      brandName: s.brand_name || undefined,
      extensionName: s.brand_name || undefined,
      primaryColor: s.primary_color || undefined,
      supportLabel: s.support_label || undefined,
      supportUrl: s.support_url || undefined
    };
    try {
      window.TS_BRANDING_CONFIG = Object.assign({}, window.TS_BRANDING_CONFIG || {}, cfg);
      if (window.applyBrandingConfig) window.applyBrandingConfig(window.TS_BRANDING_CONFIG);
    } catch (_) {}
    applyLogo(s.logo_url);
    try {
      var obs = new MutationObserver(function () { applyLogo(s.logo_url); });
      var start = function () { if (document.body) obs.observe(document.body, { childList: true, subtree: true }); };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
      } else { start(); }
    } catch (_) {}
    showDoc();
  }

  function saveCache(s) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch (_) {}
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        var obj = {}; obj[CACHE_KEY] = s;
        chrome.storage.local.set(obj);
      }
    } catch (_) {}
  }

  function load() {
    fetch(SUPABASE_URL + "/rest/v1/app_settings?id=eq.1&select=logo_url,brand_name,primary_color,support_label,support_url", {
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON }
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var s = rows && rows[0];
        if (!s) { showDoc(); return; }
        saveCache(s);
        applyAll(s);
      })
      .catch(function () { showDoc(); });
  }

  // 1) Apply localStorage cache synchronously (no flash on warm loads).
  var appliedSync = false;
  try {
    var cached = localStorage.getItem(CACHE_KEY);
    if (cached) { applyAll(JSON.parse(cached)); appliedSync = true; }
  } catch (_) {}

  // 2) Also pull from chrome.storage.local (shared across contexts).
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([CACHE_KEY], function (res) {
        var s = res && res[CACHE_KEY];
        if (s) {
          if (!appliedSync) applyAll(s);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch (_) {}
        }
        load();
      });

      // Listen for live updates from other contexts (admin panel push or fetch).
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === "local" && changes[CACHE_KEY] && changes[CACHE_KEY].newValue) {
          applyAll(changes[CACHE_KEY].newValue);
        }
      });
    } else {
      load();
    }
  } catch (_) { load(); }
})();
