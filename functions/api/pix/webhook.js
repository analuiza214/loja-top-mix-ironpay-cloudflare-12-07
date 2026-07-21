// Cloudflare Pages Function — /api/pix/webhook
// Gateway: MasterFy Pagamentos
// Recebe notificações POST e responde 200 para evitar reenvios.
//
// Formato esperado do payload (MasterFy envia o objeto completo do pagamento):
// {
//   "id": "abc123",
//   "status": "PAID",       // PAID | PENDING | CANCELLED | REFUNDED | EXPIRED
//   "amount": 5000,
//   "paidAt": "2026-07-17T...",
//   "payer": { "name": "...", "email": "...", ... },
//   "data": { "method": "PIX", "copypaste": "..." },
//   ...
// }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const notification = await request.json();
    console.log(JSON.stringify({
      event:         "MASTERFY_WEBHOOK_RECEIVED",
      payment_id:    notification.id    || null,
      status:        notification.status || null,
      amount:        notification.amount || null,
      paidAt:        notification.paidAt || null,
    }));

    // ── Adicione aqui sua lógica de negócio ao receber confirmação de pagamento ──
    // Exemplo:
    //   if (notification.status === "PAID") {
    //     await marcarPedidoComoPago(notification.id);
    //     await enviarEmailConfirmacao(notification.payer?.email);
    //   }
    // ─────────────────────────────────────────────────────────────────────────────

  } catch {
    // Body inválido — responde 200 mesmo assim para não gerar retentativas
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
}
