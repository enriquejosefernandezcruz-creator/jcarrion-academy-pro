// src/rag/answerFromManual.ts
import OpenAI from "openai";
import { searchManual, type Hit } from "./manualIndex";
import { detectLang, langName, uiStrings, type Lang } from "./lang";

console.log("VITE_OPENAI_API_KEY cargada?", !!import.meta.env.VITE_OPENAI_API_KEY);

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

function normalize(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNonEmpty(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
    text ?? ""
  );
}

/**
 * Fallback determinista de idioma cuando detectLang() falla
 * (especialmente RO sin diacríticos).
 */
function detectLangFallback(question: string, detected: Lang): Lang {
  const q = ` ${normalize(question)} `;

  // Si hay árabe, no hay duda
  if (containsArabic(question)) return "ar";

  // Solo corrige cuando detectLang dice "es"
  if (detected !== "es") return detected;

  const roSignals = [
    " care ",
    " este ",
    " numarul ",
    " maxim ",
    " ore ",
    " conducere ",
    " saptamanal ",
    " dupa ",
    " cat ",
    " timp ",
    " obligatoriu ",
    " pauza ",
    " minute ",
    " sofer ",
    " conducator ",
  ];

  const ptSignals = [
    " qual ",
    " quais ",
    " quanto ",
    " tempo ",
    " obrigatorio ",
    " pausa ",
    " minutos ",
    " conducao ", // sin acento
    " conducao ",
    " motorista ",
    " camiao ", // sin acento
    " caminhao ",
  ];

  const countHits = (signals: string[]) => signals.reduce((acc, s) => acc + (q.includes(s) ? 1 : 0), 0);

  const roHits = countHits(roSignals);
  const ptHits = countHits(ptSignals);

  // Umbrales conservadores para evitar falsos positivos
  if (roHits >= 3 && roHits >= ptHits + 1) return "ro";
  if (ptHits >= 3 && ptHits >= roHits + 1) return "pt";

  return detected;
}

type Intent = "fine_penalty" | "other";

function detectIntent(queryES: string): Intent {
  const q = ` ${normalize(queryES)} `;
  const fineTerms = [
    " multa ",
    " multas ",
    " multado ",
    " multada ",
    " multaron ",
    " multar ",
    " sancion ",
    " sanciones ",
    " infraccion ",
    " infracciones ",
    " denuncia ",
    " ticket ",
    " inmovilizacion ",
    " inmovilizado ",
  ];
  for (const t of fineTerms) if (q.includes(t)) return "fine_penalty";
  return "other";
}

function bestScore(hits: Hit[]): number {
  return hits[0]?.score ?? 0;
}

function isWeak(hits: Hit[]): boolean {
  const s = bestScore(hits);
  return hits.length === 0 || s < 10;
}

function buildContext(hits: Hit[]): string {
  return hits
    .map(
      (h, i) =>
        `FUENTE ${i + 1}
Módulo ${h.moduloId}: ${h.moduloTitulo}
Sección: ${h.seccionTitulo}
Contenido:
${h.texto}`
    )
    .join("\n\n---\n\n");
}

async function translateQuestionToES(text: string): Promise<string> {
  const system = [
    "Eres un traductor estricto.",
    "Traduce el texto al español.",
    "No añadas información. No interpretes. No reformules.",
    "Devuelve SOLO la traducción.",
  ].join("\n");

  const resp = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
  });

  return resp.choices[0]?.message?.content ?? text;
}

async function translateToTargetLang(textES: string, target: Lang): Promise<string> {
  const system = [
    "Eres un traductor estricto.",
    `Traduce el texto al idioma objetivo: ${langName(target)}.`,
    "REGLAS:",
    "- No añadas información nueva. No inventes nada.",
    "- No elimines información.",
    "- Mantén numeraciones, saltos de línea y formato.",
    "- Mantén la sección final de referencias y su contenido (puedes traducir el rótulo si procede, pero conserva módulos/secciones).",
    "- Devuelve SOLO la traducción.",
  ].join("\n");

  const resp = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: textES },
    ],
  });

  return resp.choices[0]?.message?.content ?? textES;
}

export async function answerFromManual(
  question: string,
  opts?: { query?: string; debug?: any; lang?: Lang }
) {
  // 1) Idioma: usar opts.lang si viene; si no, detectar + fallback
  const detected = opts?.lang ?? detectLang(question);
  const lang: Lang = detectLangFallback(question, detected);

  const S = uiStrings(lang);

  // ==========================================================
  // 🔒 BÚSQUEDA SIEMPRE EN ESPAÑOL
  // ==========================================================
  const rawQuery = isNonEmpty(opts?.query) ? opts!.query.trim() : null;
  let searchQ = rawQuery ?? question;

  // Si el idioma objetivo no es ES, traducimos la query a ES (índice ES).
  // También si la query no es usable.
  if (lang !== "es" || !isNonEmpty(searchQ)) {
    const source = rawQuery ?? question;
    const translated = await translateQuestionToES(source);
    if (isNonEmpty(translated)) searchQ = translated;
  }

  if (opts?.debug) {
    console.log("MANUAL DEBUG", {
      detected,
      finalLang: lang,
      rawQuery,
      questionPreview: question.slice(0, 110),
      searchQPreview: (searchQ ?? "").slice(0, 160),
    });
  }

  const intent = detectIntent(searchQ);

  // 1) Pasada A: tokens base
  let hits = searchManual(searchQ, 6, { mode: "base" });

  // 2) Pasada B: tokens expanded
  if (isWeak(hits)) {
    const hits2 = searchManual(searchQ, 6, { mode: "expanded" });
    const s1 = bestScore(hits);
    const s2 = bestScore(hits2);
    if (s2 > s1 || (s2 === s1 && hits2.length > hits.length)) hits = hits2;
  }

  // 3) Fallback multas: forzar 03.09 con query de rescate canónica
  if (intent === "fine_penalty" && isWeak(hits)) {
    const rescueQ = `${searchQ} multa sancion infraccion inmovilizacion operador trafico pago`;
    const forced = searchManual(rescueQ, 6, {
      mode: "expanded",
      restrictSectionTitleIncludes: ["03 09", "multas"],
    });

    if (forced.length > 0) hits = forced;
    else {
      const forced2 = searchManual(rescueQ, 6, {
        mode: "expanded",
        restrictSectionTitleIncludes: ["multas"],
      });
      if (forced2.length > 0) hits = forced2;
    }
  }

  // Anti-alucinación: sin hits => noInfo exacto
  if (hits.length === 0) {
    return { answer: S.noInfo, hits };
  }

  const context = buildContext(hits);

  const system = [
    "Eres un asistente de operación para conductores de Transportes JCarrion.",
    "Responde SIEMPRE usando exclusivamente el CONTEXTO proporcionado (está en español).",
    `Idioma de salida OBLIGATORIO: ${langName(lang)}.`,
    `Si no hay información suficiente en el contexto, responde EXACTAMENTE con: '${S.noInfo}'.`,
    `Devuelve siempre al final una sección '${S.refs}' con Módulo + Sección usados.`,
    "No inventes datos. No uses conocimiento externo.",
  ].join("\n");

  const resp = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `PREGUNTA:\n${question}\n\nCONTEXTO:\n${context}` },
    ],
  });

  let answer = resp.choices[0]?.message?.content ?? S.noInfo;

  // ==========================================================
  // ✅ CUMPLIMIENTO IDIOMA: si no es ES, traducimos SIEMPRE la salida
  // (evita que RO/PT salgan en español aunque detectLang falle).
  // ==========================================================
  if (lang !== "es" && answer !== S.noInfo) {
    // AR: si ya contiene árabe, evitamos traducción doble
    if (!(lang === "ar" && containsArabic(answer))) {
      answer = await translateToTargetLang(answer, lang);
    }
  }

  return { answer, hits };
}








