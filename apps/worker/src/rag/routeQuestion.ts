// worker/src/rag/routeQuestion.ts
export type Route = "manual" | "gasolineras" | "ambigua";

export type RouteResult = {
  route: Route;
  normalized: string;
  expanded: string;
  matched: Array<{ alias: string; canon: string }>;
};

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(q: string, term: string): boolean {
  const re = new RegExp(`(?:^|\\s)${escapeRegExp(term)}(?:$|\\s)`, "g");
  return re.test(` ${q} `);
}

function countHits(q: string, terms: string[]): number {
  let c = 0;
  for (const t of terms) if (hasWord(q, t)) c++;
  return c;
}

const ALIASES: Array<{ alias: string; canon: string }> = [
  { alias: "respostar", canon: "repostar" },
  { alias: "respotar", canon: "repostar" },
  { alias: "gasofa", canon: "gasolinera" },
  { alias: "diesel", canon: "gasoil" },

  { alias: "taco", canon: "tacografo" },
  { alias: "disco", canon: "tacografo" },
  { alias: "trafico", canon: "gestores de pedidos" },
  { alias: "gestor", canon: "gestores de pedidos" },
  { alias: "msg", canon: "mensajes" },
];

function expandAliases(q: string): { expanded: string; matched: RouteResult["matched"] } {
  let out = q;
  const matched: RouteResult["matched"] = [];

  for (const a of ALIASES) {
    const aliasN = norm(a.alias);
    const canonN = norm(a.canon);

    if (hasWord(out, aliasN)) {
      matched.push({ alias: aliasN, canon: canonN });
      if (!out.includes(canonN)) out = `${out} ${canonN}`.trim();
    }
  }

  const uniq = new Map<string, { alias: string; canon: string }>();
  for (const m of matched) uniq.set(`${m.alias}→${m.canon}`, m);

  return { expanded: out, matched: [...uniq.values()] };
}

export function routeQuestion(question: string): RouteResult {
  const q0 = norm(question);
  const { expanded, matched } = expandAliases(q0);

  const gasTerms = [
    "repostar",
    "respostar",
    "respotar",
    "repostaje",
    "gasolinera",
    "gasolineras",
    "estacion",
    "estaciones",
    "combustible",
    "gasoil",
    "diesel",
    "llenar",
    "llenado",
    "litros",
    "deposito",
    "as24",
    "ids",
    "solred",
    "cepsa",
    "esso",
    "q8",
    "smart diesel",
  ];

  const manualTerms = [
    "tacografo",
    "dtco",
    "tarjeta",
    "horas",
    "conducir",
    "conduccion",
    "descanso",
    "pausa",
    "documentos",
    "documentacion",
    "cmr",
    "cap",
    "dni",
    "checklist",
    "border",
    "uk",
    "reino unido",
    "eurotunel",
    "calais",
    "mensajes",
    "tablet",
    "gestores de pedidos",
  ];

  const locationIntentTerms = [
    "donde",
    "dónde",
    "cerca",
    "ubicacion",
    "ubicación",
    "localizar",
    "estaciones",
    "listado",
    "mapa",
    "ruta",
    "autopista",
    "area",
    "área",
    "servicio",
    "precio",
  ];

  const gasHits = countHits(expanded, gasTerms);
  const manualHits = countHits(expanded, manualTerms);
  const locationHits = countHits(expanded, locationIntentTerms);

  if (locationHits > 0 && gasHits > 0) {
    return { route: "gasolineras", normalized: q0, expanded, matched };
  }

  const gasScore = gasHits * 2 + locationHits;
  const manualScore = manualHits * 2;

  const looksMixed = gasHits > 0 && manualHits > 0;

  let route: Route = "manual";
  if (looksMixed) route = "ambigua";
  else if (gasScore > manualScore) route = "gasolineras";

  return { route, normalized: q0, expanded, matched };
}
