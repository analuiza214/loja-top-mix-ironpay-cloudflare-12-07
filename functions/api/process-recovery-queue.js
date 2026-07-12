// Cloudflare Pages Function — /api/process-recovery-queue
// Convertido de netlify/functions/process-recovery-queue.js
//
// IMPORTANTE: O Cloudflare Pages nao tem funcao agendada nativa.
// Configure um cron gratuito externo (ex: cron-job.org) para chamar:
//   POST https://SEU-DOMINIO.pages.dev/api/process-recovery-queue
// a cada 15 minutos, com o header: x-cron-secret: SEU_CRON_SECRET
//
// Variaveis de ambiente necessarias no Cloudflare:
//   SUPABASE_URL              — URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY — chave service_role
//   SITE_URL                  — URL do seu site (ex: https://seusite.pages.dev)
//   CRON_SECRET               — segredo para proteger esse endpoint (opcional mas recomendado)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

async function supabaseFetch(supabaseUrl, supabaseKey, path, options = {}) {
  const res = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });
  try { return { status: res.status, body: await res.json() }; }
  catch { return { status: res.status, body: await res.text() }; }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: corsHeaders });

  // Protege o endpoint com um segredo opcional
  const CRON_SECRET = env.CRON_SECRET;
  if (CRON_SECRET) {
    const provided = request.headers.get("x-cron-secret");
    if (provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  const SITE_URL     = env.SITE_URL || "";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurados." }), { status: 500, headers: corsHeaders });
  }

  const now = new Date().toISOString();

  // Busca leads com proximo email pendente
  const query = [
    `recovery_count=gte.1`,
    `recovery_count=lte.2`,
    `recovery_next_at=lte.${encodeURIComponent(now)}`,
    `status=in.(checkout_iniciado,pix_gerado)`,
    `select=id,nome,email,cidade,estado,produtos,valor,status,recovery_count`,
  ].join("&");

  const { body: leads, status: fetchStatus } = await supabaseFetch(
    SUPABASE_URL, SUPABASE_KEY,
    `/rest/v1/leads?${query}`
  );

  if (fetchStatus >= 400) {
    return new Response(JSON.stringify({ error: "Erro ao buscar leads", details: leads }), { status: 500, headers: corsHeaders });
  }

  if (!Array.isArray(leads) || leads.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, message: "Nenhum lead pendente." }), { status: 200, headers: corsHeaders });
  }

  let processed = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const emailNum = lead.recovery_count + 1; // 2 ou 3

      // Dispara o email de recuperacao
      const emailRes = await fetch(`${SITE_URL}/api/send-recovery-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailCliente: lead.email,
          nomeCliente: lead.nome,
          cidade: lead.cidade,
          estado: lead.estado,
          produtos: lead.produtos,
          valor: lead.valor,
          emailNum,
          status: lead.status,
          storeUrl: SITE_URL,
        }),
      });

      if (!emailRes.ok) {
        console.error(`[recovery-queue] Erro ao enviar email para ${lead.id}`);
        errors++;
        continue;
      }

      // Atualiza recovery_count e calcula proximo envio
      const nextCount = lead.recovery_count + 1;
      const nextAt = nextCount < 2
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // +24h
        : null;

      await supabaseFetch(
        SUPABASE_URL, SUPABASE_KEY,
        `/rest/v1/leads?id=eq.${lead.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            recovery_count: nextCount,
            recovery_next_at: nextAt,
          }),
        }
      );

      processed++;
    } catch (err) {
      console.error(`[recovery-queue] Excecao ao processar lead ${lead.id}:`, err);
      errors++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed, errors, total: leads.length }),
    { status: 200, headers: corsHeaders }
  );
}
