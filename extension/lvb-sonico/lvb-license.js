// LVB Sônico — ponte de licenciamento
// Valida as keys no painel LVB Sônico e traduz a resposta para o formato
// legado usado internamente pela extensão.
//
// FAILOVER: a extensão tenta os servidores na ordem abaixo. Se o principal
// estiver fora do ar (erro de REDE, não key inválida), ela tenta o próximo
// automaticamente. Para ativar um servidor reserva (ex.: Vercel), basta
// adicionar o endereço em API_BASES e redistribuir o zip pelo painel.
(function () {
  // Ordem de prioridade: o primeiro é o oficial; os demais são reservas.
  const API_BASES = [
    "https://lvbsonic.replit.app",
    // "https://SEU-ENDERECO-RESERVA.vercel.app", // <- ativar quando o plano B estiver no ar
  ];

  const API_BASE = API_BASES[0];
  const VALIDATE_PATH = "/api/public/validate";
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
   * Valida uma key no servidor LVB Sônico, com failover automático entre os
   * servidores de API_BASES. Só passa para o próximo servidor em caso de
   * falha de rede — respostas do tipo "key inválida/expirada/revogada" são
   * definitivas e não disparam nova tentativa.
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
    for (let i = 0; i < API_BASES.length; i++) {
      const endpoint = API_BASES[i] + VALIDATE_PATH;
      try {
        let raw;
        if (fetcher) {
          raw = await fetcher(endpoint, opts);
        } else {
          const r = await fetch(endpoint, opts);
          raw = await r.json();
        }
        return adapt(raw || {}, key);
      } catch (e) {
        // Falha de rede neste servidor: tenta o próximo da lista.
      }
    }
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

  const root = typeof window !== "undefined" ? window : self;
  root.LVB_API_BASE = API_BASE;
  root.LVB_API_BASES = API_BASES;
  root.LVB_VALIDATE_URL = API_BASE + VALIDATE_PATH;
  root.LVB_RESET_PAGE = RESET_PAGE;
  root.lvbValidate = lvbValidate;
})();
