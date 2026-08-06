// Cloudflare Pages Function — /api/card/status?id=<transactionId>
// Consulta o status de uma transação de CARTÃO na FreePay Brasil
// (o /api/pix/status deste projeto é do IronPay e não conhece transações FreePay)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "id obrigatório" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const publicKey = env.FREEPAY_PUBLIC_KEY;
  const secretKey = env.FREEPAY_SECRET_KEY;
  if (!publicKey || !secretKey) {
    return new Response(
      JSON.stringify({ error: "Gateway não configurado." }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const res = await fetch(
      `https://api.freepaybrasil.com/v1/payment-transaction/info/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${publicKey}:${secretKey}`)}`,
        },
      }
    );
    const data = await res.json();

    const raw = String(data?.data?.status || data?.status || "PENDING").toUpperCase();

    let status;
    if (["PAID", "APPROVED", "AUTHORIZED", "CONFIRMED", "SUCCEEDED", "COMPLETED"].includes(raw)) {
      status = "paid";
    } else if (["REFUSED", "DECLINED", "FAILED", "ERROR", "EXPIRED", "CANCELED", "CANCELLED", "CHARGEDBACK"].includes(raw)) {
      status = "declined";
    } else {
      status = "pending";
    }

    return new Response(JSON.stringify({ status, rawStatus: raw }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch {
    return new Response(JSON.stringify({ status: "pending" }), {
      status: 200,
      headers: corsHeaders,
    });
  }
}
