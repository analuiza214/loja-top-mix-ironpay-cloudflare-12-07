const https = require("https");

function httpsRequest(url, method, data, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const transactionId = event.queryStringParameters && event.queryStringParameters.transactionId;
  if (!transactionId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "transactionId obrigatorio" }) };
  }

  const apiToken = process.env.IRONPAY_API_TOKEN;

  if (!apiToken) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Gateway nao configurado" }) };
  }

  console.log("[pix-status] Consultando transacao IronPay:", transactionId);

  try {
    // IronPay: GET /transactions/{hash}?api_token=TOKEN
    const result = await httpsRequest(
      `https://api.ironpayapp.com.br/api/public/v1/transactions/${encodeURIComponent(transactionId)}?api_token=${encodeURIComponent(apiToken)}`,
      "GET",
      null,
      {}
    );

    console.log("[pix-status] Resposta:", result.status, JSON.stringify(result.body));

    if (result.status < 200 || result.status >= 300) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Erro ao consultar gateway de pagamento.", details: result.body }),
      };
    }

    const data = result.body;

    // IronPay usa payment_status com valores:
    //   "waiting_payment" = aguardando | "paid" = pago | "canceled" | "refunded"
    const rawStatus = (
      data.payment_status ||
      data.status ||
      ""
    ).toUpperCase();

    // Mapeia para os mesmos valores que o frontend ja espera do pix-status original
    const isPaid    = rawStatus === "PAID";
    const isExpired = rawStatus === "CANCELED" || rawStatus === "REFUNDED";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        transactionId,
        status: rawStatus,
        isPaid,
        isExpired,
        payedAt: data.paid_at || null,
      }),
    };
  } catch (err) {
    console.error("[pix-status] Erro:", err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Erro ao consultar status do pagamento." }),
    };
  }
};
