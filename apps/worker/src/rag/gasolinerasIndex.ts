// worker/src/rag/gasolinerasIndex.ts
import { GASOLINERAS } from "../../../../packages/data/gasolineras";

export type GasStatus = "ok" | "condicionado";

export type Gasolinera = Readonly<{
  id: string;
  pais: string;
  red: string;
  nombre: string;
  status: GasStatus;
  instrucciones: string;
}>;

export type GasHit = Gasolinera & { score: number };

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

const COUNTRY_ALIASES: Record<string, string> = {
  espana: "España",
  "españa": "España",
  spain: "España",

  francia: "Francia",
  france: "Francia",

  italia: "Italia",
  italy: "Italia",

  belgica: "Bélgica",
  belgium: "Bélgica",

  luxemburgo: "Luxemburgo",
  luxembourg: "Luxemburgo",

  croacia: "Croacia",
  croatia: "Croacia",
};

const NETWORK_ALIASES: Record<string, string> = {
  as24: "AS24",
  ids: "IDS",
  solred: "SOLRED",
  repsol: "SOLRED",
  esso: "ESSO",
  q8: "Q8",
};

export type GasFilters = {
  country?: string;
  status?: GasStatus;
  network?: string;
  freeText?: string;
};

export function parseGasFilters(question: string): GasFilters {
  const qNorm = normalize(question);
  const tokens = tokenize(question);

  let country: string | undefined;
  for (const t of tokens) {
    const c = COUNTRY_ALIASES[t];
    if (c) {
      country = c;
      break;
    }
  }

  let status: GasStatus | undefined;
  if (qNorm.includes("obligado") || qNorm.includes("obligatorio")) status = "ok";
  else if (qNorm.includes("condicionado")) status = "condicionado";

  let network: string | undefined;
  for (const t of tokens) {
    const n = NETWORK_ALIASES[t];
    if (n) {
      network = n;
      break;
    }
  }

  const stop = new Set<string>([
    ...Object.keys(COUNTRY_ALIASES),
    ...Object.keys(NETWORK_ALIASES),
    "donde","dónde","puedo","repostar","repostaje","gasolinera","estacion","estación",
    "llenar","combustible","diesel","gasoil","deposito","depósito","litros",
    "obligado","obligatorio","condicionado",
    "en","de","la","el","los","las","un","una","y","o","para",
  ]);

  const freeTokens = tokens.filter((t) => !stop.has(t));
  const freeText = freeTokens.length ? freeTokens.join(" ") : undefined;

  return { country, status, network, freeText };
}

function scoreGas(row: Gasolinera, qTokens: string[], qNorm: string): number {
  let score = 0;

  const hay = normalize(`${row.pais} ${row.red} ${row.nombre} ${row.instrucciones}`);

  for (const tok of qTokens) if (hay.includes(tok)) score += 2;

  const red = normalize(row.red);
  const nombre = normalize(row.nombre);

  for (const tok of qTokens) {
    if (red.includes(tok)) score += 4;
    if (nombre.includes(tok)) score += 3;
  }

  if (qNorm && hay.includes(qNorm)) score += 8;
  return score;
}

export function searchGasolineras(question: string, k = 50): GasHit[] {
  const qNorm = normalize(question);
  const qTokens = tokenize(question);

  const list = GASOLINERAS as unknown as readonly Gasolinera[];

  const scored: GasHit[] = list
    .map((g) => ({ ...g, score: scoreGas(g, qTokens, qNorm) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k);
}

export function filterGasolineras(question: string): Gasolinera[] {
  const filters = parseGasFilters(question);

  let list = (GASOLINERAS as unknown as readonly Gasolinera[]).slice();

  const norm = (s: string) => s.trim().toLowerCase();

  if (filters.country) list = list.filter((g) => g.pais === filters.country);

  if (filters.status) list = list.filter((g) => norm(g.status) === filters.status);

  if (filters.network) {
    const netNorm = norm(filters.network);
    list = list.filter((g) => norm(g.red) === netNorm || norm(g.nombre).includes(netNorm));
  }

  if (filters.freeText) {
    const ft = norm(filters.freeText);
    list = list.filter((g) => norm(`${g.nombre} ${g.instrucciones}`).includes(ft));
  }

  return list.map((g) => ({ ...g, status: norm(g.status) as "ok" | "condicionado" }));
}

