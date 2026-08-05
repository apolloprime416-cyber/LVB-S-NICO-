// LVB Sônico — ponte de licenciamento
// Valida as keys no painel LVB Sônico e traduz a resposta para o formato
// legado usado internamente pela extensão.
(function () {
  // ATENÇÃO: após publicar o painel, troque para o domínio de produção.
  const API_BASE = "https://lvbsonic.replit.app";

  const VALIDATE_ENDPOINT = API_BASE + "/api/public/validate";
  const RESET_PAGE = API_BASE + "/resetar-key";

  const MESSAGES = {
    ok: "Key válida! Bem-vindo ao LVB Sônico.",
    not_found: "Key inválida. Verifique o código e tente novamente.",
    revoked: "Esta key foi revogada.",
    expired: "Esta key expirou.",
    device_conflict:
      "Esta key está vinculada a outro dispositivo. Reset em: " + RESET_PAGE,
    invalid_request: "Requisição inválida.",
    error: "Erro de conexão com o servidor de licenças.",
  };

  function adapt(raw, key) {
    const reason = raw.reason === "device_mismatch" ? "device_conflict" : raw.reason;
    return {
      valid: !!raw.valid,
      reason: reason || null,
      message: raw.valid ? MESSAGES.ok : MESSAGES[reason] || MESSAGES.error,
      expires_at: raw.expiresAt || null,
      activated_at: null,
      status: raw.valid ? "active" : reason || "invalid",
      license_type: raw.plan === "trial" ? "trial" : "paid",
      lifetime: raw.plan === "lifetime",
      session_id: key,
      user_name: null,
      online_count: 0,
      plan: raw.plan || null,
    };
  }

  /**
   * Valida uma key no servidor LVB Sônico.
   * @param {Function} fetcher — bgFetch (retorna JSON) ou null para usar fetch direto
   * @param {string} key — código da key
   * @param {string} deviceId — fingerprint do dispositivo
   */
  async function lvbValidate(fetcher, key, deviceId) {
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: (key || "").trim(), fingerprint: deviceId || "" }),
    };
    try {
      let raw;
      if (fetcher) {
        raw = await fetcher(VALIDATE_ENDPOINT, opts);
      } else {
        const r = await fetch(VALIDATE_ENDPOINT, opts);
        raw = await r.json();
      }
      return adapt(raw || {}, key);
    } catch (e) {
      return {
        valid: false,
        reason: "network",
        message: MESSAGES.error,
        expires_at: null,
        activated_at: null,
        status: "error",
        license_type: "paid",
        lifetime: false,
        session_id: key,
        user_name: null,
        online_count: 0,
        plan: null,
      };
    }
  }

  const root = typeof window !== "undefined" ? window : self;
  root.LVB_API_BASE = API_BASE;
  root.LVB_VALIDATE_URL = VALIDATE_ENDPOINT;
  root.LVB_RESET_PAGE = RESET_PAGE;
  root.lvbValidate = lvbValidate;
})();
