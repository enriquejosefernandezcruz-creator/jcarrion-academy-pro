// ==============================
// FILE: src/App.tsx (GOLDEN BASELINE V17 - CLEAN + IA Q&A via WORKER API)
// ==============================
import { useCallback, useMemo, useRef, useState } from "react";

import AccessGate from "./components/AccessGate";

import { detectLangInfo } from "./rag/lang";
import { ask, type AskResponse } from "./api/ask";

import { DATA } from "./data/manualV16";
import { GASOLINERAS } from "./data/gasolineras";

import { QuestionInput } from "./components/QuestionInput";
import { AnswerPanel } from "./components/AnswerPanel";

import qrMapa from "./assets/qr-mapa.png";

type SeccionApp = "manual" | "recursos";

const URL_MAPA_OFICIAL =
  "https://www.google.com/maps/d/viewer?mid=1vX6A0pI_k_uGkS1Uf0vE-9zL";

export default function App() {
  const [seccion, setSeccion] = useState<SeccionApp>("manual");
  const [idx, setIdx] = useState(0);

  const [busqueda, setBusqueda] = useState("");
  const [filtroPais, setFiltroPais] = useState("Todos");

  const [enlaceCopiado, setEnlaceCopiado] = useState(false);
  const [instruccionCopiada, setInstruccionCopiada] = useState<string | null>(null);

  // --- IA Q&A (via Worker API) ---
  const [q, setQ] = useState("");
  const [qa, setQa] = useState<AskResponse | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);
  const [loadingQA, setLoadingQA] = useState(false);

  const inFlightRef = useRef(false);
  const answerRef = useRef<HTMLDivElement | null>(null);

  const scrollToAnswer = useCallback(() => {
    requestAnimationFrame(() => {
      answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // --- UTILIDADES ---
  const normalizeText = (text: string) => {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  const handleCopyMapa = () => {
    navigator.clipboard.writeText(URL_MAPA_OFICIAL);
    setEnlaceCopiado(true);
    setTimeout(() => setEnlaceCopiado(false), 2000);
  };

  const handleCopyInstruccion = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setInstruccionCopiada(id);
    setTimeout(() => setInstruccionCopiada(null), 1500);
  };

  // --- LÓGICA DE FILTRADO ---
  const paisesDisponibles = useMemo(
    () => ["Todos", ...new Set(GASOLINERAS.map((g) => g.pais))].sort(),
    []
  );

  const filteredManual = useMemo(() => {
    const qn = normalizeText(busqueda);
    if (!qn) return DATA;
    return DATA.filter(
      (m) =>
        normalizeText(m.titulo).includes(qn) ||
        m.secciones.some(
          (s) => normalizeText(s.t).includes(qn) || s.p.some((p) => normalizeText(p).includes(qn))
        )
    );
  }, [busqueda]);

  const filteredGasolineras = useMemo(() => {
    const qn = normalizeText(busqueda);
    return GASOLINERAS.filter((g) => {
      const cumplePais = filtroPais === "Todos" || g.pais === filtroPais;
      const textoCompleto = `${g.pais} ${g.nombre} ${g.red} ${g.instrucciones}`;
      const cumpleBusqueda = normalizeText(textoCompleto).includes(qn);
      return cumplePais && cumpleBusqueda;
    });
  }, [busqueda, filtroPais]);

  const mActual = filteredManual[idx] || DATA[0];

  // --- IA ASK HANDLER (via Worker API: { answer, route?, hits? }) ---
  const handleAsk = useCallback(async () => {
    const question = q.trim();
    if (!question) return;

    // Bloqueo de envío múltiple
    if (inFlightRef.current || loadingQA) return;
    inFlightRef.current = true;

    setLoadingQA(true);
    setQa(null);
    setQaError(null);

    try {
      const res = await ask(question);
      setQa(res);
    } catch (err: any) {
      const msg =
        typeof err?.message === "string" ? err.message : `Error consultando la API: ${String(err)}`;
      setQaError(msg);
    } finally {
      setLoadingQA(false);
      inFlightRef.current = false;
      scrollToAnswer();
    }
  }, [q, loadingQA, scrollToAnswer]);

  // Idioma actual de la pregunta (para RTL/LTR en respuesta)
  const { lang: qLang } = useMemo(() => detectLangInfo(q), [q]);

  const hits = qa?.hits ?? [];

  // --- REFERENCIAS (presentación limpia, sin JSON crudo, sin score en UI) ---
  const formattedRefs = useMemo(() => {
    if (!Array.isArray(hits)) return [];

    const norm = hits
      .map((h: any) => {
        const moduloId = String(h?.moduloId ?? "").trim();
        const moduloTitulo = String(h?.moduloTitulo ?? "").trim();
        const seccionTitulo = String(h?.seccionTitulo ?? "").trim();

        // score SOLO para ordenar (no se muestra)
        const score =
          typeof h?.score === "number"
            ? h.score
            : typeof h?.score === "string"
            ? Number(h.score)
            : undefined;

        const fallback =
          typeof h === "string"
            ? h
            : h?.t || h?.title || h?.ref || h?.id
            ? String(h?.t ?? h?.title ?? h?.ref ?? h?.id)
            : "";

        const label =
          moduloId || moduloTitulo || seccionTitulo
            ? `${moduloId ? `Módulo ${moduloId}` : "Módulo"}${moduloTitulo ? `: ${moduloTitulo}` : ""}${
                seccionTitulo ? ` — ${seccionTitulo}` : ""
              }`
            : fallback || "";

        const key = `${moduloId}__${seccionTitulo}__${moduloTitulo}`.toLowerCase();

        return { key, label, score };
      })
      .filter((x) => !!x.label);

    // Dedup por clave
    const seen = new Set<string>();
    const deduped: Array<{ key: string; label: string; score?: number }> = [];
    for (const r of norm) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      deduped.push(r);
    }

    // Orden por score desc (si existe), pero NO se muestra
    deduped.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));

    // Limitar para UX
    return deduped.slice(0, 6);
  }, [hits]);

  // Si la respuesta ya trae un bloque de referencias, no duplicamos en UI
  const answerHasRefs = useMemo(() => {
    const text = (qa?.answer ?? "").toLowerCase();
    return (
      text.includes("referencias") ||
      text.includes("referințe") ||
      text.includes("المراجع") ||
      text.includes("references")
    );
  }, [qa?.answer]);

  return (
    <AccessGate>
      <div
        style={{
          backgroundColor: "#0a0a0c",
          minHeight: "100vh",
          color: "#e4e4e7",
          fontFamily: "sans-serif",
        }}
      >
        {/* HEADER */}
        <header
          style={{
            padding: "1rem 2rem",
            background: "#18181b",
            borderBottom: "1px solid #27272a",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0 }}>
            JCARRION <span style={{ color: "#3b82f6" }}>ACADEMY</span>
          </h1>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={() => setSeccion("manual")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                background: seccion === "manual" ? "#2563eb" : "transparent",
                color: "white",
                border: "none",
                cursor: "pointer",
                transition: "0.2s",
              }}
            >
              Manual
            </button>

            <button
              onClick={() => setSeccion("recursos")}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                background: seccion === "recursos" ? "#2563eb" : "transparent",
                color: "white",
                border: "none",
                cursor: "pointer",
                transition: "0.2s",
              }}
            >
              Gasolineras
            </button>
          </div>
        </header>

        <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
          {/* BUSCADOR Y FILTROS */}
          <div style={{ marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <input
                type="text"
                placeholder={
                  seccion === "manual" ? "Buscar normativa..." : "Buscar por país, estación o instrucción..."
                }
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setIdx(0);
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "8px",
                  background: "#18181b",
                  border: "1px solid #27272a",
                  color: "white",
                  outline: "none",
                }}
              />
            </div>

            {/* Botones de País (Solo en Recursos) */}
            {seccion === "recursos" && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {paisesDisponibles.map((p) => (
                  <button
                    key={p}
                    onClick={() => setFiltroPais(p)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "20px",
                      fontSize: "0.8rem",
                      border: "1px solid #27272a",
                      background: filtroPais === p ? "#3b82f6" : "#18181b",
                      color: "white",
                      cursor: "pointer",
                      transition: "0.2s",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {seccion === "manual" ? (
            <>
              {/* PANEL IA: Pregunta */}
              <section
                style={{
                  background: "#18181b",
                  padding: "1rem",
                  borderRadius: 12,
                  border: "1px solid #27272a",
                  marginBottom: "1rem",
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: 10 }}>Pregunta</h3>

                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <QuestionInput
                      value={q}
                      onChange={setQ}
                      onSubmit={handleAsk}
                      placeholder="Ej: ¿Qué documentos necesito antes de iniciar el viaje? / ¿Dónde puedo repostar en Francia?"
                      disabled={loadingQA}
                    />
                  </div>

                  <button
                    disabled={!q.trim() || loadingQA}
                    onClick={handleAsk}
                    style={{
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "#2563eb",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: "bold",
                      height: 48,
                    }}
                  >
                    {loadingQA ? "..." : "Preguntar"}
                  </button>
                </div>

                {/* UX mínima obligatoria */}
                <div ref={answerRef}>
                  {loadingQA && (
                    <div style={{ marginTop: 12, fontSize: "0.9rem", color: "#a1a1aa" }}>
                      Procesando…
                    </div>
                  )}

                  {qaError && (
                    <div
                      style={{
                        marginTop: 12,
                        color: "#e4e4e7",
                        background: "#0a0a0c",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid #ef4444",
                      }}
                    >
                      {qaError}
                    </div>
                  )}

                  {qa && (
                    <div
                      style={{
                        marginTop: 12,
                        color: "#e4e4e7",
                        background: "#0a0a0c",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid #27272a",
                      }}
                    >
                      <AnswerPanel lang={qLang} answer={qa.answer} />

                      {/* Referencias UI (solo si la respuesta NO trae ya su propio bloque de referencias) */}
                      {formattedRefs.length > 0 && !answerHasRefs && (
                        <div style={{ marginTop: 12, borderTop: "1px solid #27272a", paddingTop: 10 }}>
                          <div style={{ fontSize: "0.9rem", fontWeight: "bold", marginBottom: 6 }}>
                            Referencias
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18, color: "#a1a1aa", fontSize: "0.9rem" }}>
                            {formattedRefs.map((r) => (
                              <li key={r.key}>{r.label}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* VISTA MANUAL */}
              <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "2rem" }}>
                <aside
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    maxHeight: "70vh",
                    overflowY: "auto",
                    paddingRight: "10px",
                  }}
                >
                  {filteredManual.map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => setIdx(i)}
                      style={{
                        textAlign: "left",
                        padding: "12px",
                        borderRadius: "6px",
                        background: idx === i ? "#2563eb" : "#18181b",
                        color: "white",
                        border: "1px solid #27272a",
                        cursor: "pointer",
                      }}
                    >
                      {m.id}. {m.titulo}
                    </button>
                  ))}
                </aside>

                <article
                  style={{
                    background: "#18181b",
                    padding: "2.5rem",
                    borderRadius: "12px",
                    border: "1px solid #27272a",
                  }}
                >
                  <h2 style={{ color: "#3b82f6", marginBottom: "1.5rem" }}>{mActual.titulo}</h2>

                  {mActual.secciones.map((s, i) => (
                    <div key={i} style={{ marginBottom: "2rem" }}>
                      <h3 style={{ fontSize: "1.2rem", color: "#f4f4f5" }}>{s.t}</h3>
                      {s.p.map((p, pi) => (
                        <p key={pi} style={{ color: "#a1a1aa", fontSize: "0.95rem", lineHeight: "1.6" }}>
                          • {p}
                        </p>
                      ))}
                    </div>
                  ))}
                </article>
              </div>
            </>
          ) : (
            /* VISTA RECURSOS (GASOLINERAS) */
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {/* QR CENTRALIZADO */}
              <section
                style={{
                  display: "flex",
                  background: "#18181b",
                  padding: "2rem",
                  borderRadius: "16px",
                  border: "1px solid #3b82f6",
                  alignItems: "center",
                  gap: "2rem",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ background: "white", padding: "10px", borderRadius: "8px" }}>
                  <img
                    src={qrMapa}
                    alt="QR Mapa"
                    style={{ width: "160px", height: "160px", objectFit: "contain" }}
                  />
                </div>

                <div style={{ maxWidth: "400px", textAlign: "left" }}>
                  <h2 style={{ margin: "0 0 10px 0" }}>Mapa Autorizado</h2>
                  <p style={{ color: "#a1a1aa", fontSize: "0.9rem", marginBottom: "20px" }}>
                    Utiliza este código para acceder a la ubicación de todas las estaciones o comparte el enlace con los
                    conductores.
                  </p>

                  <button
                    onClick={handleCopyMapa}
                    style={{
                      padding: "12px 24px",
                      background: enlaceCopiado ? "#20c997" : "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      width: "100%",
                      transition: "0.2s",
                    }}
                  >
                    {enlaceCopiado ? "¡Enlace Copiado!" : "Copiar Enlace"}
                  </button>
                </div>
              </section>

              {/* TARJETAS DE ESTACIONES */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: "2rem",
                }}
              >
                {filteredGasolineras.map((g) => (
                  <div
                    key={g.id}
                    style={{
                      background: "#18181b",
                      padding: "1.5rem",
                      borderRadius: "16px",
                      border: `1px solid ${g.status === "ok" ? "#20c997" : "#f59f00"}`,
                      display: "flex",
                      flexDirection: "column",
                      position: "relative",
                    }}
                  >
                    {/* Cabecera Tarjeta */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "1rem",
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", color: "#3b82f6", fontWeight: "bold" }}>
                        {g.pais.toUpperCase()}
                      </span>

                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background: g.status === "ok" ? "rgba(32,201,151,0.1)" : "rgba(245,159,0,0.1)",
                            color: g.status === "ok" ? "#20c997" : "#f59f00",
                            border: `1px solid ${
                              g.status === "ok" ? "rgba(32,201,151,0.2)" : "rgba(245,159,0,0.2)"
                            }`,
                          }}
                        >
                          {g.status === "ok" ? "OBLIGADO" : "CONDICIONADO"}
                        </span>

                        <button
                          onClick={() => handleCopyInstruccion(`${g.instrucciones}`, g.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: instruccionCopiada === g.id ? "#20c997" : "#52525b",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: "bold",
                            transition: "color 0.2s",
                          }}
                        >
                          {instruccionCopiada === g.id ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                    </div>

                    {/* Cuerpo Tarjeta */}
                    <h4 style={{ margin: "0 0 0.5rem 0", color: "#fff", fontSize: "1.1rem" }}>{g.nombre}</h4>

                    <div
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        padding: "12px",
                        borderRadius: "8px",
                        borderLeft: `4px solid ${g.status === "ok" ? "#20c997" : "#f59f00"}`,
                        marginTop: "auto",
                      }}
                    >
                      <p style={{ margin: 0, fontSize: "0.9rem", color: "#e4e4e7", lineHeight: "1.4" }}>
                        {g.instrucciones}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </AccessGate>
  );
}








