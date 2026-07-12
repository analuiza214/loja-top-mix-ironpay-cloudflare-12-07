// Webhook recebido automaticamente pela IronPay quando o pagamento é confirmado.
// O fluxo de notificação (UTMify + Facebook) é feito manualmente pelo admin.
// Esta função apenas acusa o recebimento para que a IronPay não reenvie.

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const notification = JSON.parse(event.body || "{}");
    console.log(JSON.stringify({
      event: "IRONPAY_WEBHOOK_RECEIVED",
      transaction_hash: notification.transaction_hash || null,
      status: notification.status || null,
      amount: notification.amount || null,
    }));
  } catch {
    // corpo inválido — responde 200 mesmo assim para não gerar retentativas
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ received: true }),
  };
};
