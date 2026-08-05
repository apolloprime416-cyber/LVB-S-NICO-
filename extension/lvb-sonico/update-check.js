// Update checker — blocks only the extension UI when a mandatory update is published.
(function () {
  const ENDPOINT = "https://extensaosorax.lovable.app/api/public/extension-version";
  const DOWNLOAD_ENDPOINT = "https://extensaosorax.lovable.app/api/public/extension-download";
  const SUPABASE_URL = "https://hyjsaialebpskwfvinig.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anNhaWFsZWJwc2t3ZnZpbmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjEyOTcsImV4cCI6MjEwMDI5NzI5N30.xRzxMfr92xxRxMwgNG_0iz9J2Rc6SQV3fLgVKItJgrg";
  const RELEASES_REST = SUPABASE_URL + "/rest/v1/extension_releases?select=version,title,changelog,force_update,distribution_type,external_url,zip_url,published_at&is_current=eq.true&order=published_at.desc&limit=1";
  const POLL_INTERVAL = 20 * 1000;
  const REALTIME_RECONNECT = 10 * 1000;
  const FETCH_TIMEOUT = 8000;

  const isExtensionUi = (() => {
    try {
      return location.protocol === "chrome-extension:" && /(^|\/)sidepanel\.html$/i.test(location.pathname || "");
    } catch (_) {
      return false;
    }
  })();

  function getInstalledVersion() {
    try { return chrome.runtime.getManifest().version || "0"; } catch (_) { return "0"; }
  }

  function compareVersions(a, b) {
    const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const da = pa[i] || 0, db = pb[i] || 0;
      if (da > db) return 1;
      if (da < db) return -1;
    }
    return 0;
  }

  function injectStyles() {
    if (document.getElementById("__lp_update_styles")) return;
    const style = document.createElement("style");
    style.id = "__lp_update_styles";
    style.textContent = `
      html[data-lp-update-blocked="true"], body.lp-update-blocked{height:100%!important;overflow:hidden!important}
      #__lp_update_overlay{position:fixed;inset:0;z-index:2147483647;background:linear-gradient(180deg,#06080c 0%,#0d1118 54%,#07090d 100%);display:flex;flex-direction:column;font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f8fafc;padding:16px;overflow:auto;pointer-events:auto}
      #__lp_update_overlay *{box-sizing:border-box}
      #__lp_update_overlay .lp-shell{min-height:100%;display:flex;flex-direction:column;gap:14px}
      #__lp_update_overlay .lp-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0}
      #__lp_update_overlay .lp-brand{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;font-weight:800;letter-spacing:.02em;color:#f8fafc}
      #__lp_update_overlay .lp-mark{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#00a8ff,#006dff);display:grid;place-items:center;box-shadow:0 10px 26px rgba(0,168,255,.26);font-size:15px;flex-shrink:0}
      #__lp_update_overlay .lp-status{font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;border:1px solid rgba(248,113,113,.34);background:rgba(248,113,113,.12);color:#fecaca;border-radius:999px;padding:5px 8px;white-space:nowrap}
      #__lp_update_overlay .lp-card{position:relative;overflow:hidden;border:1px solid rgba(148,163,184,.16);background:linear-gradient(180deg,rgba(17,24,39,.96),rgba(8,12,18,.98));border-radius:18px;padding:18px 16px;box-shadow:0 24px 70px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.06)}
      #__lp_update_overlay .lp-card::before{content:"";position:absolute;inset:0 0 auto 0;height:4px;background:linear-gradient(90deg,#00a8ff,#38bdf8,#22c55e)}
      #__lp_update_overlay .lp-icon{width:54px;height:54px;margin:6px auto 14px;border-radius:16px;background:rgba(0,168,255,.12);border:1px solid rgba(56,189,248,.28);display:grid;place-items:center;color:#7dd3fc;box-shadow:0 18px 44px rgba(0,168,255,.16)}
      #__lp_update_overlay .lp-icon svg{width:26px;height:26px}
      #__lp_update_overlay h1{font-size:21px;line-height:1.12;margin:0;text-align:center;font-weight:900;letter-spacing:0;color:#fff}
      #__lp_update_overlay .lp-subtitle{font-size:12.5px;line-height:1.55;margin:9px auto 0;text-align:center;color:#cbd5e1;max-width:290px}
      #__lp_update_overlay .lp-version-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0 12px}
      #__lp_update_overlay .lp-version-box{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.72);border-radius:12px;padding:10px;min-width:0}
      #__lp_update_overlay .lp-label{display:block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:5px}
      #__lp_update_overlay .lp-value{display:block;font-family:"SF Mono",ui-monospace,Menlo,Consolas,monospace;font-size:13px;font-weight:900;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #__lp_update_overlay .lp-title{font-size:13px;font-weight:800;color:#e2e8f0;margin:12px 0 8px}
      #__lp_update_overlay .lp-log{white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;word-break:break-word;background:transparent;border:none;border-radius:0;padding:0;font-size:14px;line-height:1.6;color:#e2e8f0;max-height:none;overflow:visible}
      #__lp_update_overlay .lp-log:empty::before{content:"Pacote obrigatório disponível para instalação.";color:#94a3b8;font-size:14px}
      #__lp_update_overlay .lp-steps{display:grid;gap:8px;margin:14px 0 0}
      #__lp_update_overlay .lp-step{display:flex;align-items:flex-start;gap:8px;color:#cbd5e1;font-size:11.5px;line-height:1.35}
      #__lp_update_overlay .lp-dot{width:18px;height:18px;border-radius:999px;display:grid;place-items:center;flex:0 0 18px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.24);color:#86efac;font-size:10px;font-weight:900}
      #__lp_update_overlay .lp-actions{margin-top:auto;padding-top:14px;display:grid;gap:8px;flex-shrink:0}
      #__lp_update_overlay .lp-primary{width:100%;border:none;border-radius:14px;padding:13px 14px;background:linear-gradient(135deg,#00a8ff,#0078ff);color:#fff;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 16px 34px rgba(0,120,255,.32);display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px}
      #__lp_update_overlay .lp-primary:hover{filter:brightness(1.08);transform:translateY(-1px)}
      #__lp_update_overlay .lp-foot{font-size:10.5px;line-height:1.45;text-align:center;color:#94a3b8;padding:0 8px 2px}
      @media (max-height:620px){#__lp_update_overlay{padding:12px}#__lp_update_overlay .lp-card{padding:15px 14px}#__lp_update_overlay .lp-icon{display:none}#__lp_update_overlay h1{font-size:18px}#__lp_update_overlay .lp-log{font-size:13px}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function openDownload(url) {
    const target = url || DOWNLOAD_ENDPOINT;
    try {
      if (chrome && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: target, active: true });
        return;
      }
    } catch (_) {}
    try { window.open(target, "_blank", "noopener,noreferrer"); } catch (_) { location.href = target; }
  }

  function renderBlock(info) {
    if (!isExtensionUi) {
      removeBlock();
      return;
    }
    injectStyles();
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => renderBlock(info), { once: true });
      return;
    }
    document.documentElement.setAttribute("data-lp-update-blocked", "true");
    document.body.classList.add("lp-update-blocked");
    let el = document.getElementById("__lp_update_overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "__lp_update_overlay";
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div class="lp-shell">
        <div class="lp-top">
          <div class="lp-brand"><span class="lp-mark">↻</span><span>LVB Sônico</span></div>
          <span class="lp-status">Disponível</span>
        </div>
        <section class="lp-card" aria-live="polite">
          <div class="lp-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M12 15v2"/></svg>
          </div>
          <h1>Atualização disponível</h1>
          <p class="lp-subtitle">Existe uma versão mais recente, mas a extensão continua liberada.</p>
          <div class="lp-version-grid">
            <div class="lp-version-box"><span class="lp-label">Instalada</span><span class="lp-value" id="__lp_installed_version"></span></div>
            <div class="lp-version-box"><span class="lp-label">Nova versão</span><span class="lp-value" id="__lp_latest_version"></span></div>
          </div>
          <div class="lp-title" id="__lp_update_title"></div>
          <div class="lp-log" id="__lp_update_log"></div>
          <div class="lp-steps">
            <div class="lp-step"><span class="lp-dot">1</span><span>Baixe o pacote atualizado.</span></div>
            <div class="lp-step"><span class="lp-dot">2</span><span>Substitua a extensão em modo desenvolvedor.</span></div>
          </div>
        </section>
        <div class="lp-actions">
          <button class="lp-primary" id="__lp_update_btn" type="button">Baixar atualização</button>
          <p class="lp-foot">Depois de instalar, reabra a extensão para liberar o painel.</p>
        </div>
      </div>`;
    el.querySelector("#__lp_installed_version").textContent = getInstalledVersion();
    el.querySelector("#__lp_latest_version").textContent = info.version || "-";
    el.querySelector("#__lp_update_title").textContent = info.title || "Pacote obrigatório disponível";
    el.querySelector("#__lp_update_log").textContent = info.changelog || "";
    el.querySelector("#__lp_update_btn").addEventListener("click", () => openDownload(info.download_url || DOWNLOAD_ENDPOINT));
  }

  function removeBlock() {
    document.documentElement.removeAttribute("data-lp-update-blocked");
    if (document.body) document.body.classList.remove("lp-update-blocked");
    const el = document.getElementById("__lp_update_overlay");
    if (el) el.remove();
  }

  function normalizeRelease(data) {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.version) return null;
    return {
      version: row.version,
      title: row.title || "Atualização disponível",
      changelog: row.changelog || "",
      force_update: !!row.force_update,
      distribution_type: row.distribution_type,
      download_url: row.download_url || (row.distribution_type === "external" ? row.external_url : row.zip_url) || DOWNLOAD_ENDPOINT,
      published_at: row.published_at || null,
    };
  }

  function applyState(data) {
    if (!data || !data.version) {
      try {
        chrome.storage.local.set({
          lp_update_blocked: false,
          lp_force_update: false,
          lp_latest_version: null,
          lp_download_url: null,
          lp_update_title: null,
          lp_update_changelog: null,
          lp_update_checked_at: Date.now(),
        });
      } catch (_) {}
      removeBlock();
      return;
    }
    const installed = getInstalledVersion();
    // Bloqueia a UI da extensão quando o painel publica uma atualização obrigatória
    // e a versão instalada é anterior à versão atual publicada.
    const blocked = !!data.force_update && compareVersions(installed, data.version) < 0;
    try {
      chrome.storage.local.set({
        lp_latest_version: data.version,
        lp_force_update: !!data.force_update,
        lp_update_blocked: blocked,
        lp_download_url: data.download_url,
        lp_update_title: data.title,
        lp_update_changelog: data.changelog,
        lp_update_checked_at: Date.now(),
      });
    } catch (_) {}
    if (blocked) renderBlock(data); else removeBlock();
  }

  function renderFromStoredState() {
    if (!isExtensionUi) return;
    try {
      chrome.storage.local.get({
        lp_update_blocked: false,
        lp_latest_version: null,
        lp_force_update: false,
        lp_download_url: null,
        lp_update_title: null,
        lp_update_changelog: null,
      }, (r) => {
        if (!r) return removeBlock();
        const installed = getInstalledVersion();
        const shouldBlock = !!r.lp_force_update && r.lp_latest_version
          && compareVersions(installed, r.lp_latest_version) < 0;
        if (shouldBlock) {
          renderBlock({
            version: r.lp_latest_version,
            title: r.lp_update_title || "Atualiza\u00e7\u00e3o obrigat\u00f3ria",
            changelog: r.lp_update_changelog || "",
            force_update: true,
            download_url: r.lp_download_url || DOWNLOAD_ENDPOINT,
          });
        } else {
          removeBlock();
        }
      });
    } catch (_) { removeBlock(); }
  }

  function fetchJson(url, options) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT) : null;
    const opts = Object.assign({ cache: "no-store" }, options || {});
    if (controller) opts.signal = controller.signal;
    return fetch(url, opts).then((resp) => {
      if (timer) clearTimeout(timer);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp.json();
    });
  }

  // Neutralized: never contacts the previous owner's servers. Kept inert so any
  // stale "update blocked" state is cleared and the panel stays unlocked.
  async function getCurrentRelease() {
    return null;
  }

  async function check() {
    try {
      chrome.storage.local.set({
        lp_update_blocked: false,
        lp_force_update: false,
        lp_latest_version: null,
        lp_download_url: null,
        lp_update_title: null,
        lp_update_changelog: null,
        lp_update_checked_at: Date.now(),
      });
    } catch (_) {}
    removeBlock();
  }

  // ---- Real-time via Supabase Realtime WebSocket ----
  let ws = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let ref = 0;
  const nextRef = () => String(++ref);

  function connectRealtime() {
    // Neutralized: no realtime connection to the previous owner's Supabase.
    return;
    /* eslint-disable no-unreachable */
    try {
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
      const wsUrl = SUPABASE_URL.replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + SUPABASE_ANON + "&vsn=1.0.0";
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          topic: "realtime:public:extension_releases",
          event: "phx_join",
          payload: { config: { postgres_changes: [{ event: "*", schema: "public", table: "extension_releases" }] } },
          ref: nextRef(),
        }));
        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          try { ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: nextRef() })); } catch (_) {}
        }, 25000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && (msg.event === "postgres_changes" || msg.event === "INSERT" || msg.event === "UPDATE" || msg.event === "DELETE")) check();
        } catch (_) {}
      };
      ws.onclose = () => {
        clearInterval(heartbeatTimer);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectRealtime, REALTIME_RECONNECT);
      };
      ws.onerror = () => { try { ws.close(); } catch (_) {} };
    } catch (_) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectRealtime, REALTIME_RECONNECT);
    }
    /* eslint-enable no-unreachable */
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { renderFromStoredState(); check(); });
  } else {
    renderFromStoredState();
    check();
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !isExtensionUi) return;
      if (changes.lp_update_blocked || changes.lp_latest_version || changes.lp_download_url || changes.lp_update_title || changes.lp_update_changelog) {
        renderFromStoredState();
      }
    });
  } catch (_) {}

  setInterval(check, POLL_INTERVAL);
  setTimeout(check, 2000);
  setTimeout(check, 8000);
  connectRealtime();

  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
})();