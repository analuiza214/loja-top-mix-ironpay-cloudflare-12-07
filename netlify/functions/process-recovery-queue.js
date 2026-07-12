// process-recovery-queue.js
//
// Netlify scheduled function — roda a cada 15 minutos.
// Busca leads com emails de recuperação pendentes e dispara
// o próximo email da sequência (2/3 ou 3/3).
//
// Configuração no netlify.toml:
//   [functions."process-recovery-queue"]
//     schedule = "*/15 * * * *"   <- cron: a cada 15 minutos
//
// Variáveis de ambiente necessárias:
//   SUPABASE_URL              — URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY — chave service_role (contorna RLS)
//   URL                       — URL do site Netlify (injetada automaticamente)

const https = require("https");

function httpsRequest(url, method, data, extraHeaders) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = data ? JSON.stringify(data) : null;
    const bodyBuffer = body ? Buffer.from(body, "utf8") : null;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bodyBuffer ? { "Content-Length": bodyBuffer.length } : {}),
        ...extraHeaders,
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on("error", reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SITE_URL    = process.env.URL; // Netlify injeta automaticamente

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("[recovery-queue] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.");
    return { statusCode: 500, body: "config missing" };
  }

  const supabaseHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const now = new Date().toISOString();

  // ── 1. Busca leads com próximo email pendente ────────────────────────────
  // Critérios:
  //   • recovery_count IN (1, 2)  — já receberam pelo menos 1, ainda não completaram
  //   • recovery_next_at <= now   — já passou o tempo de espera
  //   • status IN checkout_iniciado, pix_gerado — ainda não pagou
  const query = [
    `recovery_count=gte.1`,
    `recovery_count=lte.2`,
    `recovery_next_at=lte.${encodeURIComponent(now)}`,
    `status=in.(checkout_iniciado,pix_gerado)`,
    `select=id,nome,email,cidade,estado,produtos,valor,status,recovery_count`,
  ].join("&");

  let leads = [];
  try {
    const res = await httpsRequest(
      `${SUPABASE_URL}/rest/v1/leads?${query}`,
      "GET",
      null,
      supabaseHeaders
    );
    if (!Array.isArray(res.body)) {
      console.error("[recovery-queue] Resposta inesperada do Supabase:", res.body);
      return { statusCode: 500, body: "supabase error" };
    }
    leads = res.body;
    console.log(`[recovery-queue] ${leads.length} lead(s) na fila.`);
  } catch (err) {
    console.error("[recovery-queue] Erro ao buscar leads:", err.message);
    return { statusCode: 500, body: "fetch error" };
  }

  if (leads.length === 0) {
    return { statusCode: 200, body: "nada a fazer" };
  }

  // ── 2. Para cada lead, envia o próximo email e atualiza o registro ────────
  for (const lead of leads) {
    const nextEmailNumber = (lead.recovery_count || 0) + 1; // 2 ou 3

    // Intervalo após este email:
    //  email 2 → próximo (email 3) em 5 horas
    //  email 3 → sequência concluída (next_at null)
    const nextAt = nextEmailNumber === 2
      ? new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
      : null;

    try {
      // Chama o endpoint de envio (centraliza toda a lógica de HTML/copy)
      const sendUrl = SITE_URL
        ? `${SITE_URL}/.netlify/functions/send-recovery-email`
        : null;

      if (!sendUrl) {
        console.error("[recovery-queue] Variável URL não disponível — não é possível chamar send-recovery-email.");
        continue;
      }

      const sendRes = await httpsRequest(
        sendUrl,
        "POST",
        {
          emailCliente: lead.email,
          nomeCliente:  lead.nome,
          cidade:       lead.cidade,
          estado:       lead.estado,
          produtos:     lead.produtos,
          valor:        lead.valor,
          status:       lead.status,
          emailNumber:  nextEmailNumber,
        },
        {} // sem auth extra — a função é pública (acessada via URL própria)
      );

      if (sendRes.status >= 200 && sendRes.status < 300) {
        console.log(`[recovery-queue] Lead ${lead.id}: email #${nextEmailNumber} enviado ✅`);
      } else {
        console.error(`[recovery-queue] Lead ${lead.id}: falha no envio — status ${sendRes.status}`, sendRes.body);
        continue; // não atualiza o DB se o email falhou, vai tentar de novo na próxima rodada
      }
    } catch (err) {
      console.error(`[recovery-queue] Lead ${lead.id}: erro ao chamar send-recovery-email —`, err.message);
      continue;
    }

    // ── 3. Atualiza recovery_count e recovery_next_at no Supabase ──────────
    try {
      const updateBody = {
        recovery_count: nextEmailNumber,
        recovery_next_at: nextAt,
        updated_at: new Date().toISOString(),
      };

      const updateRes = await httpsRequest(
        `${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`,
        "PATCH",
        updateBody,
        { ...supabaseHeaders, Prefer: "return=minimal" }
      );

      if (updateRes.status >= 200 && updateRes.status < 300) {
        console.log(`[recovery-queue] Lead ${lead.id}: DB atualizado → count=${nextEmailNumber}, next_at=${nextAt ?? "null (fim)"}`);
      } else {
        console.error(`[recovery-queue] Lead ${lead.id}: falha ao atualizar DB —`, updateRes.body);
      }
    } catch (err) {
      console.error(`[recovery-queue] Lead ${lead.id}: erro ao atualizar DB —`, err.message);
    }
  }

  return { statusCode: 200, body: `processados: ${leads.length}` };
};
