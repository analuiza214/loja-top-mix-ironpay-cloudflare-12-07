// Cloudflare Pages Function — /api/pix/status
// Gateway: MasterFy Pagamentos (https://api.masterfypagamentos.com/v1/payment/{id})
// TESTADO: GET retorna status PENDING corretamente ✅

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const url = new URL(request.url);
  // Suporte a ambos os parâmetros: transactionId e id
  const transactionId = url.searchParams.get("transactionId") || url.searchParams.get("id");

  if (!transactionId) {
    return new Response(
      JSON.stringify({ error: "transactionId obrigatório" }),
      { status: 400, headers: corsHeaders }
    );
  }

  const apiKey = env.MASTERFY_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Gateway não configurado. Configure MASTERFY_API_KEY no Netlify." }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const res = await fetch(
      `https://api.masterfypagamentos.com/v1/payment/${encodeURIComponent(transactionId)}`,
      {
        method: "GET",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Erro ao consultar gateway.", details: data }),
        { status: 502, headers: corsHeaders }
      );
    }

    // MasterFy usa: PENDING | PAID | CANCELLED | REFUNDED | EXPIRED
    const rawStatus = (data.status || "").toUpperCase();
    const isPaid    = rawStatus === "PAID";
    const isExpired = rawStatus === "CANCELLED" || rawStatus === "EXPIRED" || rawStatus === "REFUNDED";

    return new Response(
      JSON.stringify({
        transactionId,
        status:    rawStatus,
        isPaid,
        isExpired,
        payedAt:   data.paidAt || null,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro ao consultar status do pagamento." }),
      { status: 502, headers: corsHeaders }
    );
  }
}
