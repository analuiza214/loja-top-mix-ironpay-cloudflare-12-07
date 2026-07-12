import { useState } from "react";
import { Link } from "wouter";
import {
  Search, Package, Truck, CheckCircle, Clock,
  ShieldCheck, ChevronRight, ArrowLeft, MapPin, Box,
  AlertTriangle, RotateCcw, Warehouse, CreditCard, Copy, CheckCheck, X
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const PixIcon = ({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 512 512" width={size} height={size} fill="none">
    <path d="M112.57 391.19c20.056 0 38.928-7.808 53.12-22l76.693-76.692c5.385-5.386 14.765-5.373 20.136 0l76.989 76.989c14.192 14.192 33.064 22 53.12 22h15.138l-97.2 97.2c-30.418 30.417-79.73 30.417-110.148 0l-97.49-97.497h10.642z" fill="#22c55e"/>
    <path d="M112.57 120.81c20.056 0 38.928 7.808 53.12 22l76.693 76.692c5.565 5.566 14.57 5.566 20.136 0l76.989-76.989c14.192-14.192 33.064-22 53.12-22h10.642l-97.49-97.49c-30.418-30.417-79.73-30.417-110.148 0l-97.2 97.2 14.138-.413z" fill="#22c55e"/>
    <path d="M458.783 200.643l-54.36-54.36h-11.795c-14.14 0-27.68 5.62-37.667 15.606l-76.989 76.989c-13.693 13.693-37.438 13.706-51.144 0l-76.693-76.692c-9.987-9.987-23.527-15.607-37.667-15.607H97.327l-54.11 54.11c-30.418 30.417-30.418 79.73 0 110.147l54.11 54.111h15.141c14.14 0 27.68-5.62 37.667-15.607l76.693-76.692c6.924-6.924 15.983-10.387 25.572-10.387 9.588 0 18.648 3.463 25.572 10.387l76.989 76.989c9.987 9.987 23.527 15.607 37.667 15.607h11.795l54.36-54.361c30.417-30.417 30.417-79.73 0-110.24z" fill="#22c55e"/>
  </svg>
);

// ── Formata data em pt-BR ────────────────────────────────────────────────────
function fmt(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " — "
    + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// ── Busca a data de origem no Supabase ────────────────────────────────────────
async function getDataOrigem(codigo: string): Promise<Date | null> {
  const { data } = await supabase
    .from("rastreio_origem")
    .select("origem_at")
    .eq("codigo", codigo)
    .maybeSingle();

  if (data?.origem_at) return new Date(data.origem_at);
  return null;
}

// ── Gera linha do tempo baseada no tempo real decorrido desde o 1º rastreio ──
// Cronograma:
//   +0 min    → Pedido Confirmado
//   +30 min   → Em Separação
//   +55 min   → Em Embalagem
//   +175 min  → Enviado / Em Trânsito
//   +2 dias   → Saiu para Entrega
//   +2d+1h    → ❌ Falha na Entrega
//   +2d+2h    → Em Trânsito — Retornando ao CD
//   +3 dias   → Chegou ao Centro de Distribuição
//   +3d+1h    → Aguardando Taxa de Reenvio
function gerarEtapas(origem: Date) {
  const agora  = new Date();
  const minDecorridos = (agora.getTime() - origem.getTime()) / (1000 * 60);

  const MIN_SEPARACAO   = 30;
  const MIN_EMBALAGEM   = 55;
  const MIN_TRANSITO    = 175;
  const MIN_SAIU        = 2 * 24 * 60;
  const MIN_FALHA       = 2 * 24 * 60 + 60;
  const MIN_RETORNANDO  = 2 * 24 * 60 + 120;
  const MIN_CD          = 3 * 24 * 60;
  const MIN_TAXA        = 3 * 24 * 60 + 60;

  const tSeparacao  = new Date(origem.getTime() + MIN_SEPARACAO  * 60 * 1000);
  const tEmbalagem  = new Date(origem.getTime() + MIN_EMBALAGEM  * 60 * 1000);
  const tTransito   = new Date(origem.getTime() + MIN_TRANSITO   * 60 * 1000);
  const tSaiu       = new Date(origem.getTime() + MIN_SAIU       * 60 * 1000);
  const tFalha      = new Date(origem.getTime() + MIN_FALHA      * 60 * 1000);
  const tRetornando = new Date(origem.getTime() + MIN_RETORNANDO * 60 * 1000);
  const tCD         = new Date(origem.getTime() + MIN_CD         * 60 * 1000);
  const tTaxa       = new Date(origem.getTime() + MIN_TAXA       * 60 * 1000);
  const tEntrega    = addDays(origem, 2);

  const fmtPrev = (d: Date) =>
    `Previsão: ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

  const etapasBase = [
    {
      icone: CheckCircle,
      label: "Pedido Confirmado",
      descricao: "Pagamento recebido e pedido registrado com sucesso.",
      data: fmt(origem),
      ok: true,
      erro: false,
    },
    {
      icone: Box,
      label: "Em Separação",
      descricao: "Seu produto está sendo separado no estoque.",
      data: minDecorridos >= MIN_SEPARACAO ? fmt(tSeparacao) : fmtPrev(tSeparacao),
      ok: minDecorridos >= MIN_SEPARACAO,
      erro: false,
    },
    {
      icone: Package,
      label: "Em Embalagem",
      descricao: "O produto está sendo embalado com cuidado para envio.",
      data: minDecorridos >= MIN_EMBALAGEM ? fmt(tEmbalagem) : fmtPrev(tEmbalagem),
      ok: minDecorridos >= MIN_EMBALAGEM,
      erro: false,
    },
    {
      icone: Truck,
      label: "Enviado / Em Trânsito",
      descricao: "Pedido entregue aos Correios e a caminho de você.",
      data: minDecorridos >= MIN_TRANSITO ? fmt(tTransito) : fmtPrev(tTransito),
      ok: minDecorridos >= MIN_TRANSITO,
      erro: false,
    },
    {
      icone: MapPin,
      label: "Saiu para Entrega",
      descricao: "O pedido está com o entregador e chegará em breve.",
      data: minDecorridos >= MIN_SAIU ? fmt(tSaiu) : fmtPrev(tEntrega),
      ok: minDecorridos >= MIN_SAIU,
      erro: false,
    },
  ];

  const etapasExtras = [];

  if (minDecorridos >= MIN_FALHA) {
    etapasExtras.push({
      icone: AlertTriangle,
      label: "Falha na Tentativa de Entrega",
      descricao: "A transportadora tentou realizar a entrega, mas não foi possível concluí-la. Nenhum responsável encontrado no endereço informado.",
      data: fmt(tFalha),
      ok: false,
      erro: true,
    });
  }

  if (minDecorridos >= MIN_RETORNANDO) {
    etapasExtras.push({
      icone: RotateCcw,
      label: "Em Trânsito — Retornando ao CD",
      descricao: "O produto está retornando ao Centro de Distribuição de origem em Guarulhos, SP.",
      data: fmt(tRetornando),
      ok: true,
      erro: false,
    });
  }

  if (minDecorridos >= MIN_CD) {
    etapasExtras.push({
      icone: Warehouse,
      label: "Chegou ao Centro de Distribuição",
      descricao: "O produto chegou ao Centro de Distribuição — Guarulhos, SP. Aguardando instrução do destinatário.",
      data: fmt(tCD),
      ok: true,
      erro: false,
    });
  }

  if (minDecorridos >= MIN_TAXA) {
    etapasExtras.push({
      icone: CreditCard,
      label: "Aguardando Taxa de Reenvio",
      descricao: "Para que seu pedido seja reenviado, é necessário pagar a taxa de reenvio. Entre em contato conosco pelo WhatsApp para efetuar o pagamento e reagendar a entrega.",
      data: fmt(tTaxa),
      ok: false,
      erro: false,
      taxa: true,
    });
  }

  const todasEtapas = [...etapasBase, ...etapasExtras];

  let status: string;
  if (minDecorridos >= MIN_TAXA) {
    status = "⚠️ Taxa de Reenvio";
  } else if (minDecorridos >= MIN_CD) {
    status = "🏭 No Centro de Distribuição";
  } else if (minDecorridos >= MIN_RETORNANDO) {
    status = "🔄 Retornando ao CD";
  } else if (minDecorridos >= MIN_FALHA) {
    status = "❌ Falha na Entrega";
  } else if (minDecorridos >= MIN_SAIU) {
    status = "🚚 Saiu para Entrega";
  } else if (minDecorridos >= MIN_TRANSITO) {
    status = "🚛 Em Trânsito";
  } else if (minDecorridos >= MIN_EMBALAGEM) {
    status = "📦 Em Embalagem";
  } else if (minDecorridos >= MIN_SEPARACAO) {
    status = "🔍 Em Separação";
  } else {
    status = "✅ Confirmado";
  }

  return {
    etapas: todasEtapas,
    previsao: tEntrega.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric"
    }),
    status,
    falhaEntrega: minDecorridos >= MIN_FALHA,
    aguardandoTaxa: minDecorridos >= MIN_TAXA,
  };
}

// ── Valida formato do código TM ───────────────────────────────────────────────
function codigoValido(cod: string): boolean {
  return /^TM[A-Z0-9]{6,10}$/i.test(cod.trim().replace(/[-\s]/g, ""));
}

interface TaxaPixData {
  pixCode: string;
  qrCodeImage: string | null;
  qrCodeBase64: string | null;
}

export default function RastrearPedido() {
  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState<ReturnType<typeof gerarEtapas> | null>(null);
  const [codigoExibido, setCodigoExibido] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // estados do Pix de taxa de reenvio
  const [taxaPix, setTaxaPix] = useState<TaxaPixData | null>(null);
  const [taxaLoading, setTaxaLoading] = useState(false);
  const [taxaErro, setTaxaErro] = useState("");
  const [taxaCopied, setTaxaCopied] = useState(false);
  const [taxaPaga, setTaxaPaga] = useState(false);

  // nome exibido na linha do tempo de reenvio
  const [nomeCliente] = useState<string | null>(null);

  // estados do comprovante
  const [comprovanteFase, setComprovanteFase] = useState<"idle" | "upload" | "enviado">("idle");
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [comprovanteEnviando, setComprovanteEnviando] = useState(false);
  const [comprovanteErro, setComprovanteErro] = useState("");
  const [comprovanteEnviadoEm, setComprovanteEnviadoEm] = useState<Date | null>(null);

  async function handleGerarTaxaPix() {
    setTaxaLoading(true);
    setTaxaErro("");
    try {
      const res = await fetch("/api/pix/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 9.00,
          name: "Cliente TopMix",
          productName: "Taxa de Reenvio — Pedido " + codigoExibido,
        }),
      });
      const data = await res.json() as {
        pixCode?: string;
        qrCodeBase64?: string;
        qrCodeImage?: string;
        transactionId?: string;
        error?: string;
      };
      if (!res.ok || !data.pixCode) {
        throw new Error(data.error || "Erro ao gerar Pix. Tente novamente.");
      }
      setTaxaPix({
        pixCode: data.pixCode,
        qrCodeBase64: data.qrCodeBase64 || null,
        qrCodeImage: data.qrCodeImage || null,
      });
    } catch (e) {
      setTaxaErro(e instanceof Error ? e.message : "Erro ao gerar Pix.");
    } finally {
      setTaxaLoading(false);
    }
  }

  async function handleEnviarComprovante(file: File) {
    setComprovanteFile(file);
    setComprovanteEnviando(true);
    setComprovanteErro("");
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${codigoExibido}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("comprovantes")
        .upload(path, file, { upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(path);
      await supabase.from("comprovantes_taxa").insert({
        tracking_code: codigoExibido,
        file_url: urlData.publicUrl,
        file_name: file.name,
      });
      setComprovanteFase("enviado");
      setTaxaPaga(true);
      setComprovanteEnviadoEm(new Date());
    } catch (e) {
      setComprovanteErro(e instanceof Error ? e.message : "Erro ao enviar. Tente novamente.");
      setComprovanteEnviando(false);
    }
  }

  async function handleCopiarTaxa() {
    if (!taxaPix?.pixCode) return;
    try { await navigator.clipboard.writeText(taxaPix.pixCode); } catch { /* ignored */ }
    setTaxaCopied(true);
    setTimeout(() => setTaxaCopied(false), 3000);
  }

  function buildQrSrc(b64?: string | null, img?: string | null): string | null {
    if (b64) {
      if (b64.startsWith("data:") || b64.startsWith("http")) return b64;
      return `data:image/png;base64,${b64}`;
    }
    return img || null;
  }

  async function handleRastrear(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const cod = codigo.trim();
    if (!cod) return;

    if (!codigoValido(cod)) {
      setErro("Código inválido. Use o código enviado pela Top Mix, ex: TM2A3B4C5D");
      return;
    }

    setLoading(true);
    try {
      const origem = await getDataOrigem(cod.toUpperCase());
      if (!origem) {
        setErro("Código não encontrado. Verifique o código enviado pela Top Mix e tente novamente.");
        return;
      }
      setCodigoExibido(cod.toUpperCase());
      setResultado(gerarEtapas(origem));
    } catch {
      setErro("Erro ao buscar o rastreio. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4">
            <ArrowLeft className="h-4 w-4" /> Voltar à Loja
          </Link>
          <h1 className="text-2xl font-black text-gray-900">Rastrear Pedido</h1>
          <p className="text-sm text-gray-500 mt-1">Digite o código enviado pela Top Mix para ver o status da entrega.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Formulário */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <form onSubmit={handleRastrear} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={codigo}
                onChange={e => { setCodigo(e.target.value); setErro(""); }}
                placeholder="Ex: TM2A3B4C5D"
                className={`w-full pl-9 pr-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent ${erro ? "border-red-400" : "border-gray-200"}`}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-xl font-black text-sm text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #15803d, #22c55e)" }}
            >
              {loading ? "Buscando..." : "RASTREAR"}
            </button>
          </form>
          {erro && <p className="text-xs text-red-500 mt-2">{erro}</p>}
        </div>

        {/* Resultado */}
        {resultado && (
          <>
            {/* Alerta de falha na entrega */}
            {resultado.falhaEntrega && (
              <div className="bg-red-50 border border-red-300 rounded-2xl p-5 flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="font-black text-red-700 text-sm">Falha na Tentativa de Entrega</p>
                  <p className="text-red-600 text-xs mt-1 leading-relaxed">
                    Não foi possível realizar a entrega do seu pedido. A transportadora tentou entregar, mas não encontrou nenhum responsável no endereço informado. O produto está sendo retornado ao Centro de Distribuição em <strong>Guarulhos, SP</strong>.
                  </p>
                  {resultado.aguardandoTaxa && (
                    <p className="text-red-700 text-xs mt-2 font-bold">
                      Para receber seu pedido novamente, entre em contato e pague a taxa de reenvio.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Alerta de taxa de reenvio */}
            {resultado.aguardandoTaxa && (
              <div className="rounded-2xl overflow-hidden border border-orange-200 shadow-sm">

                {/* Cabeçalho */}
                <div className="bg-orange-500 px-5 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-black text-white text-sm">Taxa de Reenvio Necessária</p>
                    <p className="text-orange-100 text-xs">Pague agora e receba seu pedido</p>
                  </div>
                </div>

                <div className="bg-white p-5 space-y-4">
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Seu pedido chegou ao Centro de Distribuição em <strong>Guarulhos, SP</strong>. Para reenviarmos o produto ao seu endereço, é necessário o pagamento de uma taxa de reenvio.
                  </p>

                  {/* Destaque do valor */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-500 mb-1">Pague a taxa de reenvio agora — é apenas</p>
                    <p className="text-3xl font-black text-green-700">R$ 9,00</p>
                  </div>

                  {/* Confirmação de pagamento */}
                  {taxaPaga ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                        <CheckCheck className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="font-black text-green-700 text-sm">Comprovante recebido!</p>
                        <p className="text-xs text-green-600 mt-0.5">Seu reenvio já está sendo processado. Acompanhe abaixo.</p>
                      </div>
                    </div>

                  ) : taxaPix ? (
                    /* QR Code gerado */
                    <div className="space-y-4">
                      <div className="flex flex-col items-center gap-3">
                        {/* QR Code */}
                        {(() => {
                          const src = buildQrSrc(taxaPix.qrCodeBase64, taxaPix.qrCodeImage);
                          return src ? (
                            <div className="p-3 bg-white border-2 border-green-200 rounded-2xl shadow-sm">
                              <img src={src} alt="QR Code Pix" className="w-44 h-44 object-contain" />
                            </div>
                          ) : (
                            <div className="w-44 h-44 bg-gray-100 rounded-2xl flex items-center justify-center">
                              <PixIcon size={48} />
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <PixIcon size={14} />
                          Escaneie o QR Code com o app do seu banco
                        </div>
                      </div>

                      {/* Código copia e cola */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-1.5 text-center">Ou copie o código Pix:</p>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono text-gray-700 truncate">
                            {taxaPix.pixCode}
                          </div>
                          <button
                            onClick={handleCopiarTaxa}
                            className="shrink-0 px-3 py-2.5 rounded-xl font-bold text-xs text-white flex items-center gap-1.5 transition-all hover:opacity-90 active:scale-95"
                            style={{ background: taxaCopied ? "#15803d" : "linear-gradient(135deg, #15803d, #22c55e)" }}
                          >
                            {taxaCopied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {taxaCopied ? "Copiado!" : "Copiar"}
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => setComprovanteFase("upload")}
                        className="w-full py-2.5 rounded-xl border-2 border-green-500 text-green-700 font-bold text-xs hover:bg-green-50 transition-all"
                      >
                        ✅ Já paguei — confirmar pagamento
                      </button>
                    </div>

                  ) : (
                    /* Botão inicial */
                    <div className="space-y-3">
                      <button
                        onClick={handleGerarTaxaPix}
                        disabled={taxaLoading}
                        className="flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl font-black text-base text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg, #15803d, #22c55e)" }}
                      >
                        {taxaLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Gerando Pix...
                          </>
                        ) : (
                          <>
                            <PixIcon size={20} />
                            Pagar taxa e receber mercadoria
                          </>
                        )}
                      </button>
                      {taxaErro && <p className="text-xs text-red-500 text-center">{taxaErro}</p>}
                    </div>
                  )}

                  {/* Texto pós-botão */}
                  {!taxaPaga && (
                    <p className="text-xs text-gray-400 text-center leading-relaxed">
                      Assim que efetuar o pagamento da taxa, iremos reenviar seu pedido, dessa vez sem erros. ✅
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-6">
              {/* Cabeçalho do pedido */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">Pedido</p>
                  <p className="font-black text-lg text-gray-900">{codigoExibido}</p>
                </div>
                <span className={`text-xs font-black px-3 py-1.5 rounded-full ${
                  resultado.falhaEntrega
                    ? "bg-red-100 text-red-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}>
                  {resultado.status}
                </span>
              </div>

              {/* Linha do tempo */}
              <div className="space-y-0">
                {resultado.etapas.map((etapa, i) => {
                  const Icon = etapa.icone;
                  const isLast = i === resultado.etapas.length - 1;
                  const isTaxa = (etapa as any).taxa === true;

                  const circleBg = etapa.erro
                    ? "bg-red-500"
                    : isTaxa
                    ? "bg-orange-400"
                    : etapa.ok
                    ? "bg-green-500"
                    : "bg-gray-200";

                  const iconColor = etapa.erro || etapa.ok || isTaxa ? "text-white" : "text-gray-400";

                  const lineBg = etapa.erro
                    ? "bg-red-200"
                    : etapa.ok
                    ? "bg-green-300"
                    : "bg-gray-200";

                  const labelColor = etapa.erro
                    ? "text-red-700"
                    : isTaxa
                    ? "text-orange-700"
                    : etapa.ok
                    ? "text-gray-900"
                    : "text-gray-400";

                  const dataColor = etapa.erro
                    ? "text-red-500"
                    : isTaxa
                    ? "text-orange-500"
                    : etapa.ok
                    ? "text-green-600"
                    : "text-gray-400";

                  return (
                    <div key={i} className="flex gap-4 relative">
                      <div className="flex flex-col items-center">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 z-10 ${circleBg}`}>
                          <Icon className={`h-4 w-4 ${iconColor}`} />
                        </div>
                        {!isLast && (
                          <div
                            className={`w-0.5 flex-1 my-1 ${lineBg}`}
                            style={{ minHeight: 28 }}
                          />
                        )}
                      </div>
                      <div className="pb-5">
                        <p className={`text-sm font-bold ${labelColor}`}>
                          {etapa.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{etapa.descricao}</p>
                        <p className={`text-xs mt-0.5 font-semibold ${dataColor}`}>
                          {etapa.data}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Previsão de entrega — só mostra se não houve falha e taxa não paga */}
              {!resultado.falhaEntrega && !taxaPaga && (
                <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
                  <strong>Previsão de entrega:</strong> até {resultado.previsao}. Fique atento — entregas podem variar conforme a região.
                </div>
              )}
            </div>

            {/* ── Card de reenvio (aparece após comprovante enviado) ─────────── */}
            {taxaPaga && comprovanteEnviadoEm && (() => {
              const agora = new Date();
              const minReenvio = (agora.getTime() - comprovanteEnviadoEm.getTime()) / 60000;

              const tSeparacao = new Date(comprovanteEnviadoEm.getTime() + 2 * 60 * 60 * 1000);
              const tSaiu      = new Date(comprovanteEnviadoEm.getTime() + 1 * 24 * 60 * 60 * 1000);
              const tEntregue  = new Date(comprovanteEnviadoEm.getTime() + 3 * 24 * 60 * 60 * 1000);

              const fmtPrev = (d: Date) =>
                `Previsão: ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

              const nomeExibido = nomeCliente
                ? nomeCliente.split(" ")[0].charAt(0).toUpperCase() + nomeCliente.split(" ")[0].slice(1).toLowerCase()
                : "você";

              const etapasReenvio = [
                {
                  icone: CheckCheck,
                  label: "Taxa de Reenvio Confirmada",
                  descricao: "Comprovante de pagamento recebido. Seu reenvio foi aprovado.",
                  data: fmt(comprovanteEnviadoEm),
                  ok: true,
                  erro: false,
                  ultimo: false,
                },
                {
                  icone: Package,
                  label: "Em Separação para Reenvio",
                  descricao: "Seu pedido está sendo separado e embalado novamente para envio.",
                  data: minReenvio >= 120 ? fmt(tSeparacao) : fmtPrev(tSeparacao),
                  ok: minReenvio >= 120,
                  erro: false,
                  ultimo: false,
                },
                {
                  icone: Truck,
                  label: "Saiu para Entrega",
                  descricao: "Pedido despachado! O entregador já está a caminho do seu endereço.",
                  data: minReenvio >= 1440 ? fmt(tSaiu) : fmtPrev(tSaiu),
                  ok: minReenvio >= 1440,
                  erro: false,
                  ultimo: false,
                },
                {
                  icone: CheckCircle,
                  label: `Entregue a ${nomeExibido}`,
                  descricao: "Seu Kit Completo Copa 2026 foi entregue com sucesso. Obrigado pela confiança!",
                  data: minReenvio >= 4320 ? fmt(tEntregue) : fmtPrev(tEntregue),
                  ok: minReenvio >= 4320,
                  erro: false,
                  ultimo: true,
                },
              ];

              return (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-green-200 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900 text-base">Reenvio em Andamento</h3>
                      <p className="text-xs text-green-600 font-semibold">Previsão de entrega: {tEntregue.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</p>
                    </div>
                  </div>

                  <div>
                    {etapasReenvio.map((etapa, i) => {
                      const Icon = etapa.icone;
                      const isLast = i === etapasReenvio.length - 1;
                      const circleBg = etapa.ok ? "bg-green-500" : "bg-gray-200";
                      const iconColor = etapa.ok ? "text-white" : "text-gray-400";
                      const lineBg   = etapa.ok ? "bg-green-300" : "bg-gray-200";
                      const labelColor = etapa.ok ? "text-gray-900" : "text-gray-400";
                      const dataColor  = etapa.ok ? "text-green-600" : "text-gray-400";

                      return (
                        <div key={i} className="flex gap-4 relative">
                          <div className="flex flex-col items-center">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 z-10 ${circleBg}`}>
                              <Icon className={`h-4 w-4 ${iconColor}`} />
                            </div>
                            {!isLast && (
                              <div className={`w-0.5 flex-1 my-1 ${lineBg}`} style={{ minHeight: 28 }} />
                            )}
                          </div>
                          <div className="pb-5">
                            <p className={`text-sm font-bold ${labelColor}`}>{etapa.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{etapa.descricao}</p>
                            <p className={`text-xs mt-0.5 font-semibold ${dataColor}`}>{etapa.data}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Onde encontro meu código */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-black text-gray-900 mb-4">Onde encontro meu código?</h2>
          <ul className="space-y-3 text-sm text-gray-600">
            {[
              "No WhatsApp — enviamos o código assim que o pedido for confirmado",
              "O código começa sempre com TM seguido de letras e números",
              "Dúvidas? Fale conosco pelo WhatsApp (83) 99129-7085",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center text-sm text-gray-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-green-500" />
          Não encontrou? <Link href="/fale-conosco" className="text-yellow-600 font-bold hover:underline ml-1">Entre em contato</Link>
        </div>
      </div>

      {/* ── Popup comprovante de pagamento ── */}
      {comprovanteFase === "upload" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={e => { if (!comprovanteEnviando && e.target === e.currentTarget) { setComprovanteFase("idle"); setComprovanteFile(null); setComprovanteErro(""); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center">
                  <CheckCheck className="h-4 w-4 text-green-600" />
                </div>
                <p className="font-black text-gray-900 text-sm">Confirmar pagamento</p>
              </div>
              {!comprovanteEnviando && (
                <button
                  onClick={() => { setComprovanteFase("idle"); setComprovanteFile(null); setComprovanteErro(""); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Conteúdo */}
            <div className="px-5 py-5 space-y-4">
              {comprovanteEnviando ? (
                /* Estado de carregamento */
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                    <div className="w-7 h-7 border-[3px] border-green-200 border-t-green-600 rounded-full animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-gray-800 text-sm">Enviando comprovante...</p>
                    <p className="text-xs text-gray-500 mt-1">Aguarde, estamos processando.</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Envie o <strong>comprovante do pagamento</strong> da taxa de reenvio. Assim que enviar, seu reenvio é confirmado automaticamente.
                  </p>

                  {/* Área de upload — dispara automaticamente ao selecionar */}
                  <label className="flex flex-col items-center justify-center gap-2 w-full h-32 rounded-xl border-2 border-dashed border-green-300 bg-green-50 cursor-pointer hover:bg-green-100 active:scale-98 transition-all">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleEnviarComprovante(file);
                      }}
                    />
                    <span className="text-3xl">📎</span>
                    <span className="text-sm text-gray-700 font-bold">Toque para anexar o comprovante</span>
                    <span className="text-xs text-gray-400">Foto, print ou PDF — qualquer formato</span>
                  </label>

                  {comprovanteErro && (
                    <p className="text-xs text-red-500 text-center bg-red-50 rounded-xl px-3 py-2">{comprovanteErro}</p>
                  )}

                  <p className="text-[11px] text-gray-400 text-center">
                    Ao enviar qualquer arquivo, seu pagamento é confirmado e o reenvio é reagendado automaticamente.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
