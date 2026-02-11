// src/rag/router.ts
function normalize(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GAS_STRONG = [
  "repostar",
  "repostaje",
  "gasolinera",
  "estacion",
  "estacion",
  "llenar",
  "combustible",
  "gasoil",
  "diesel",
  "deposito",
  "litros",
  "as24",
  "ids",
  "solred",
  "repsol",
  "esso",
  "q8",
];

const MANUAL_STRONG = [
  "tacografo",
  "dtco",
  "conduccion",
  "conducir",
  "descanso",
  "pausa",
  "horas",
  "tiempos",
  "documentacion",
  "documentos",
  "cmr",
  "cap",
  "dni",
  "procedimiento",
  "checklist",
  "border",
  "uk",
  "eurotunel",
  "calais",
];

const COUNTRIES = ["espana", "francia", "italia", "belgica", "luxemburgo", "croacia", "spain", "france", "italy"];

function score(qNorm: string, terms: string[]): number {
  let s = 0;
  for (const t of terms) if (qNorm.includes(t)) s += 5;
  return s;
}

export type Route = "manual" | "gasolineras" | "needs_clarification";

export function routeQuestion(question: string): { route: Route; reason: string } {
  const qNorm = normalize(question);

  const G = score(qNorm, GAS_STRONG);
  const M = score(qNorm, MANUAL_STRONG);

  const hasCountry = COUNTRIES.some((c) => qNorm.includes(c));
  const hasWhere = qNorm.includes("donde") || qNorm.includes("dónde");
  const hasFuelVerb = ["repostar", "gasolinera", "estacion", "llenar", "combustible"].some((t) => qNorm.includes(t));

  let G2 = G;
  let M2 = M;

  if (hasCountry && hasFuelVerb) G2 += 2;
  if (hasCountry && !hasFuelVerb) M2 += 0; // v1: no boost manual por país

  if (hasWhere && hasFuelVerb) G2 += 6;

  // Decisión (sin mezcla)
  if ((G2 >= 8 && G2 >= M2 + 4) || (hasWhere && hasFuelVerb)) {
    return { route: "gasolineras", reason: `gas_score=${G2} manual_score=${M2}` };
  }

  if (M2 >= 8 && M2 >= G2 + 4) {
    return { route: "manual", reason: `manual_score=${M2} gas_score=${G2}` };
  }

  return { route: "needs_clarification", reason: `ambiguous gas_score=${G2} manual_score=${M2}` };
}
