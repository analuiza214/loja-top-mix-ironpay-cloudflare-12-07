const https = require("https");

function httpsRequest(url, method, data, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: method || "POST",
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

// Gera um CPF valido aleatorio para uso quando o cliente nao informar
function gerarCpfAleatorio() {
  const rand = () => Math.floor(Math.random() * 9);
  const d = Array.from({ length: 9 }, rand);

  let sum = d.reduce((acc, v, i) => acc + v * (10 - i), 0);
  d.push(((sum * 10) % 11) % 10);

  sum = d.reduce((acc, v, i) => acc + v * (11 - i), 0);
  d.push(((sum * 10) % 11) % 10);

  return d.join("");
}

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiToken    = process.env.IRONPAY_API_TOKEN;
  const offerHash   = process.env.IRONPAY_OFFER_HASH;
  const productHash = process.env.IRONPAY_PRODUCT_HASH;

  if (!apiToken || !offerHash || !productHash) {
    console.error("[pix-create] Variaveis IRONPAY_API_TOKEN / IRONPAY_OFFER_HASH / IRONPAY_PRODUCT_HASH nao configuradas");
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Gateway de pagamento nao configurado." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "JSON invalido." }) };
  }

  const { amount, name, document, productName } = body;

  if (!amount || !name) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Campos obrigatorios: amount, name." }) };
  }

  // Se o cliente nao informou CPF, gera um valido para o gateway
  const cpfDigits = document ? String(document).replace(/\D/g, "") : "";
  const payerDocument = cpfDigits.length === 11 ? cpfDigits : gerarCpfAleatorio();

  const siteUrl = process.env.URL || process.env.DEPLOY_URL || "";
  const webhookUrl = siteUrl ? `${siteUrl}/.netlify/functions/pix-webhook` : undefined;

  // IronPay usa centavos — multiplica por 100
  const amountInCents = Math.round(Number(amount) * 100);

  const payload = {
    amount: amountInCents,
    offer_hash: offerHash,
    payment_method: "pix",
    customer: {
      name: String(name),
      email: body.email ? String(body.email) : "cliente@email.com",
      phone_number: body.phone ? String(body.phone).replace(/\D/g, "") || "00000000000" : "00000000000",
      document: payerDocument,
    },
    cart: [
      {
        product_hash: productHash,
        title: productName || "Kit Album Copa Do Mundo 2026 Capa Mole + 250 Figurinhas Panini",
        cover: null,
        price: amountInCents,
        quantity: 1,
        operation_type: 1,
        tangible: true,
      },
    ],
    expire_in_days: 1,
    transaction_origin: "api",
    ...(webhookUrl ? { postback_url: webhookUrl } : {}),
  };

  console.log("[pix-create] Criando transacao IronPay:", { amount: amountInCents, payerName: name });

  try {
    const result = await httpsRequest(
      `https://api.ironpayapp.com.br/api/public/v1/transactions?api_token=${encodeURIComponent(apiToken)}`,
      "POST",
      payload,
      {}
    );

    console.log("[pix-create] Resposta IronPay status:", result.status);
    console.log("[pix-create] Body:", JSON.stringify(result.body));

    if (result.status < 200 || result.status >= 300) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Erro ao gerar PIX. Tente novamente.", details: result.body }),
      };
    }

    const data = result.body;

    // IronPay retorna: { hash, payment_status, pix: { pix_qr_code, pix_url } }
    const transactionId = data.hash || data.transaction_hash;

    if (!transactionId) {
      console.error("[pix-create] Hash da transacao nao encontrado:", JSON.stringify(data));
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Resposta invalida do gateway: hash ausente.", rawResponse: data }),
      };
    }
    const pix = data.pix || {};
    const pixCode = pix.pix_qr_code || pix.qr_code || pix.code || pix.copy_paste || null;
    const qrCodeBase64 = pix.qr_code_base64 || pix.base64 || null;
    // IronPay nao retorna imagem do QR — gera via servico publico
    const qrCodeImage = pixCode
      ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`
      : pix.pix_url || null;

    if (!pixCode) {
      console.error("[pix-create] Codigo PIX nao encontrado:", JSON.stringify(data));
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: "QR Code PIX nao gerado. Verifique as credenciais.", rawResponse: data }),
      };
    }

    console.log("[pix-create] PIX gerado:", { transactionId, preview: pixCode.slice(0, 30) });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        transactionId,
        status: data.payment_status || "PENDENTE",
        pixCode,
        qrCodeBase64: qrCodeBase64 || null,
        qrCodeImage: qrCodeImage || null,
      }),
    };
  } catch (err) {
    console.error("[pix-create] Erro:", err);
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: "Erro de comunicacao com o gateway." }) };
  }
};
