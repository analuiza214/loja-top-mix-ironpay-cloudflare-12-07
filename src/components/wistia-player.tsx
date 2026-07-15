/**
 * WistiaPlayerLazy — carrega o player Wistia apenas quando necessário.
 *
 * Por padrão (autoLoad=false) mostra uma thumbnail clicável (facade pattern).
 * Com autoLoad=true inicia o carregamento assim que o elemento entra na viewport
 * (útil para vídeos abaixo do fold).
 *
 * O script do Wistia (E-v1.js) é injetado UMA única vez por página,
 * não importa quantos players existam.
 */

import { useState, useRef, useEffect } from "react";

// ── Singleton: injeta o script Wistia apenas uma vez ──────────────────────────
let _wistiaScriptInjected = false;
function injectWistiaScript() {
  if (_wistiaScriptInjected) return;
  _wistiaScriptInjected = true;
  const s = document.createElement("script");
  s.src = "//fast.wistia.com/assets/external/E-v1.js";
  s.async = true;
  document.head.appendChild(s);
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface WistiaPlayerLazyProps {
  /** ID do vídeo no Wistia (ex: "5hq52h0zlz") */
  mediaId: string;
  /** Proporção altura/largura (ex: 0.5625 para 16:9, 0.75 para 4:3) */
  aspect?: number;
  /**
   * false (padrão) → carrega ao clicar (melhor para vídeos próximos ao topo).
   * true           → carrega ao entrar na viewport (melhor para vídeos abaixo do fold).
   */
  autoLoad?: boolean;
}

// ── Componente ────────────────────────────────────────────────────────────────
export function WistiaPlayerLazy({
  mediaId,
  aspect = 0.5625,
  autoLoad = false,
}: WistiaPlayerLazyProps) {
  const [active, setActive] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Ativa automaticamente ao entrar na viewport (quando autoLoad=true)
  useEffect(() => {
    if (!autoLoad || active) return;

    const el = wrapRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setActive(true);
          injectWistiaScript();
          observer.disconnect();
        }
      },
      { rootMargin: "300px" } // começa a carregar 300px antes de aparecer
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [autoLoad, active]);

  // Ativa ao clicar (quando autoLoad=false)
  const handleClick = () => {
    if (active) return;
    setActive(true);
    injectWistiaScript();
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        paddingBottom: `${aspect * 100}%`,
        background: "#0f0f0f",
        overflow: "hidden",
      }}
    >
      {active ? (
        /* Player real do Wistia */
        <div
          className={`wistia_embed wistia_async_${mediaId} videoFoam=true`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />
      ) : (
        /* Facade — thumbnail + botão de play */
        <button
          onClick={handleClick}
          aria-label="Reproduzir vídeo"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 0,
          }}
        >
          {/* Thumbnail via Wistia swatch (carrega rápido, é só uma cor dominante) */}
          <img
            src={`https://fast.wistia.com/embed/medias/${mediaId}/swatch`}
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.4,
            }}
            loading="lazy"
            decoding="async"
          />

          {/* Botão play centralizado */}
          <div
            style={{
              position: "relative",
              zIndex: 2,
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.92)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
              transition: "transform 0.15s ease",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              style={{ marginLeft: 3 }}
            >
              <polygon points="5,3 21,12 5,21" fill="#111" />
            </svg>
          </div>

          {/* Label */}
          <span
            style={{
              position: "relative",
              zIndex: 2,
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,0.75)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Toque para assistir
          </span>
        </button>
      )}
    </div>
  );
}
