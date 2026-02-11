// src/rag/manualIndex.ts
import { DATA } from "../data/manualV16";

export type Hit = {
  moduloId: string;
  moduloTitulo: string;
  seccionTitulo: string;
  texto: string;
  score: number;
};

type IndexRow = {
  moduloId: string;
  moduloTitulo: string;
  seccionTitulo: string;
  texto: string;
  haystack: string; // normalizado + enriquecido
  titleStack: string; // solo títulos normalizados
  sectionKey: string; // título de sección normalizado
};

export type SearchOpts = {
  mode?: "base" | "expanded";
  restrictSectionTitleIncludes?: string[];
};

function normalize(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  const n = normalize(s);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length >= 2);
}

function expandQueryTokens(tokens: string[]): string[] {
  const out = new Set<string>(tokens);
  const add = (...t: string[]) => t.forEach((x) => out.add(x));

  // Conducción / horas / tiempos
  if (out.has("horas")) add("tiempos", "duracion", "maximo", "diaria", "semanal");
  if (out.has("hora")) add("tiempos", "duracion", "maximo");
  if (out.has("tiempo") || out.has("tiempos")) add("horas", "duracion", "maximo");
  if (out.has("conducir") || out.has("conduccion") || out.has("conductor"))
    add("tacografo", "descanso", "pausa");
  if (out.has("descanso") || out.has("pausa")) add("conduccion", "tacografo", "4h30", "45");

  // Tacógrafo
  if (out.has("tacografo")) add("dtco", "tarjeta", "conduccion", "descanso", "pausa");

  // Documentación
  if (out.has("documentos") || out.has("documentacion")) add("cmr", "hoja", "tarjeta", "dni", "cap");

  // UK / Border (si existe en tu contenido)
  if (out.has("uk") || out.has("reino") || out.has("unido") || out.has("border"))
    add("calais", "eurotunel", "checklist", "food", "defense");

  // === MULTAS / SANCIONES (CRÍTICO) ===
  // Variantes verbales/flexiones frecuentes -> canónico
  if (
    out.has("multado") ||
    out.has("multada") ||
    out.has("multaron") ||
    out.has("multar") ||
    out.has("multan") ||
    out.has("multando")
  ) {
    add("multa", "multas", "sancion", "sanciones", "infraccion", "infracciones", "inmovilizacion");
  }

  if (out.has("multa") || out.has("multas"))
    add("sancion", "sanciones", "infraccion", "infracciones", "denuncia", "ticket", "inmovilizacion");

  if (out.has("sancion") || out.has("sanciones"))
    add("multa", "multas", "infraccion", "infracciones", "inmovilizacion", "pago");

  if (out.has("infraccion") || out.has("infracciones"))
    add("multa", "multas", "sancion", "sanciones");

  if (out.has("inmovilizacion"))
    add("multa", "multas", "sancion", "sanciones", "operador", "trafico", "pago");

  // pago
  if (out.has("pagar") || out.has("pago"))
    add("multa", "multas", "sancion", "sanciones", "gestion", "empresa", "colaboradora");

  return Array.from(out);
}

function buildHaystack(moduloTitulo: string, seccionTitulo: string, texto: string) {
  const t = normalize(moduloTitulo);
  const st = normalize(seccionTitulo);
  const body = normalize(texto);

  const enrich = [
    body,
    body.replace(/\btiempos?\b/g, "tiempos horas"),
    body.replace(/\bhoras?\b/g, "horas tiempos"),
    body.replace(/\bconduccion\b/g, "conduccion conducir"),
    body.replace(/\bconducir\b/g, "conducir conduccion"),
    // multas / sanciones
    body.replace(/\bmulta(s)?\b/g, "multa multas sancion sanciones infraccion infracciones"),
    body.replace(/\bsancion(es)?\b/g, "sancion sanciones multa multas infraccion infracciones"),
    body.replace(/\binfraccion(es)?\b/g, "infraccion infracciones multa multas sancion sanciones"),
  ].join(" ");

  return {
    haystack: `${t} ${st} ${enrich}`.replace(/\s+/g, " ").trim(),
    titleStack: `${t} ${st}`.replace(/\s+/g, " ").trim(),
    sectionKey: st,
  };
}

function scoreRow(row: IndexRow, qTokens: string[], qNorm: string): number {
  if (qTokens.length === 0) return 0;

  let score = 0;

  for (const tok of qTokens) if (row.haystack.includes(tok)) score += 2;
  for (const tok of qTokens) if (row.titleStack.includes(tok)) score += 6;
  if (qNorm && row.haystack.includes(qNorm)) score += 8;

  const hasConduc = qTokens.includes("conducir") || qTokens.includes("conduccion");
  const hasHoras = qTokens.includes("horas") || qTokens.includes("tiempos");
  if (hasConduc && hasHoras && row.haystack.includes("descanso")) score += 4;

  const hasFine =
    qTokens.includes("multa") ||
    qTokens.includes("multas") ||
    qTokens.includes("multado") ||
    qTokens.includes("multada") ||
    qTokens.includes("sancion") ||
    qTokens.includes("sanciones") ||
    qTokens.includes("infraccion") ||
    qTokens.includes("infracciones");

  if (hasFine) {
    if (row.haystack.includes("procedimiento")) score += 4;
    if (row.haystack.includes("contactar")) score += 3;
    if (row.haystack.includes("operador") || row.haystack.includes("trafico")) score += 3;
    if (row.haystack.includes("pago") || row.haystack.includes("pagar")) score += 2;
    if (row.titleStack.includes("multas")) score += 10;
  }

  return score;
}

const INDEX: IndexRow[] = (() => {
  const rows: IndexRow[] = [];
  for (const m of DATA) {
    for (const s of m.secciones) {
      const texto = (s.p ?? []).join("\n");
      const built = buildHaystack(m.titulo, s.t, texto);

      rows.push({
        moduloId: String(m.id),
        moduloTitulo: m.titulo,
        seccionTitulo: s.t,
        texto,
        haystack: built.haystack,
        titleStack: built.titleStack,
        sectionKey: built.sectionKey,
      });
    }
  }
  return rows;
})();

function restrictRows(rows: IndexRow[], opts?: SearchOpts): IndexRow[] {
  const inc = (opts?.restrictSectionTitleIncludes ?? [])
    .map(normalize)
    .filter(Boolean);

  if (inc.length === 0) return rows;

  return rows.filter((r) => inc.every((frag) => r.sectionKey.includes(frag)));
}

export function searchManual(question: string, k = 6, opts?: SearchOpts): Hit[] {
  const qNorm = normalize(question);

  const qTokensBase = tokenize(question);
  const qTokens =
    (opts?.mode ?? "expanded") === "expanded" ? expandQueryTokens(qTokensBase) : qTokensBase;

  const candidateRows = restrictRows(INDEX, opts);

  const scored: Hit[] = candidateRows
    .map((row) => ({
      moduloId: row.moduloId,
      moduloTitulo: row.moduloTitulo,
      seccionTitulo: row.seccionTitulo,
      texto: row.texto,
      score: scoreRow(row, qTokens, qNorm),
    }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of scored) {
    const key = `${h.moduloId}::${normalize(h.seccionTitulo)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= k) break;
  }

  return out;
}


