// src/rag/answerFromGasolineras.ts
import {
  filterGasolineras,
  parseGasFilters,
  type Gasolinera,
} from "./gasolinerasIndex";
import { detectLang, type Lang } from "./lang";

// Lee estado aunque venga como status/estado y normaliza
const getStatus = (g: any) =>
  String(g?.status ?? g?.estado ?? g?.Status ?? g?.Estado ?? g?.STATUS ?? "")
    .trim()
    .toLowerCase()
    .replace(/^"+|"+$/g, "");

function sortGas(a: Gasolinera, b: Gasolinera): number {
  const sa = getStatus(a as any);
  const sb = getStatus(b as any);

  if (sa !== sb) return sa === "ok" ? -1 : 1;
  if (a.pais !== b.pais) return a.pais.localeCompare(b.pais);
  if (a.red !== b.red) return a.red.localeCompare(b.red);
  return a.nombre.localeCompare(b.nombre);
}

function STR(lang: Lang) {
  switch (lang) {
    case "pt":
      return {
        title: "Postos autorizados para abastecer (lista oficial):",
        country: "País",
        network: "Rede",
        status: "Estado",
        result: "Resultado",
        all: "TODOS",
        allF: "TODAS",
        ok: "OBRIGATÓRIO (ok)",
        cond: "CONDICIONADO (condicionado)",
        none: "- (sem resultados)",
        instruction: "Instrução",
        shown: (cap: number, total: number) =>
          `A mostrar ${cap} de ${total}. Indica país ou rede para filtrar.`,
        source:
          "Fonte: Lista oficial de postos autorizados (gasolineras.csv)",
        noMatch: [
          "Não há postos que coincidam com a tua consulta na lista oficial.",
          "",
          "Sugestão: indica país (Espanha/França/Itália/...) ou rede (AS24/IDS/SOLRED).",
          "Fonte: Lista oficial de postos autorizados (gasolineras.csv)",
        ].join("\n"),
      };
    case "ro":
      return {
        title: "Stații autorizate pentru alimentare (listă oficială):",
        country: "Țară",
        network: "Rețea",
        status: "Stare",
        result: "Rezultat",
        all: "TOATE",
        allF: "TOATE",
        ok: "OBLIGATORIU (ok)",
        cond: "CONDIȚIONAT (condiționat)",
        none: "- (fără rezultate)",
        instruction: "Instrucțiune",
        shown: (cap: number, total: number) =>
          `Se afișează ${cap} din ${total}. Indică țara sau rețeaua.`,
        source:
          "Sursă: Lista oficială de stații autorizate (gasolineras.csv)",
        noMatch: [
          "Nu există stații care să corespundă căutării tale în lista oficială.",
          "",
          "Sugestie: indică țara (Spania/Franța/Italia/...) sau rețeaua (AS24/IDS/SOLRED).",
          "Sursă: Lista oficială de stații autorizate (gasolineras.csv)",
        ].join("\n"),
      };
    case "ar":
      return {
        title: "محطات الوقود المعتمدة للتزوّد (القائمة الرسمية):",
        country: "البلد",
        network: "الشبكة",
        status: "الحالة",
        result: "النتيجة",
        all: "الكل",
        allF: "الكل",
        ok: "إلزامي (ok)",
        cond: "مشروط (condicionado)",
        none: "- (لا توجد نتائج)",
        instruction: "التعليمات",
        shown: (cap: number, total: number) =>
          `عرض ${cap} من ${total}. حدّد البلد أو الشبكة.`,
        source: "المصدر: القائمة الرسمية للمحطات المعتمدة (gasolineras.csv)",
        noMatch: [
          "لا توجد محطات تطابق طلبك في القائمة الرسمية.",
          "",
          "اقتراح: حدّد البلد (إسبانيا/فرنسا/إيطاليا/...) أو الشبكة (AS24/IDS/SOLRED).",
          "المصدر: القائمة الرسمية للمحطات المعتمدة (gasolineras.csv)",
        ].join("\n"),
      };
    default:
      return {
        title: "Gasolineras autorizadas para repostar (listado oficial):",
        country: "País",
        network: "Red",
        status: "Estado",
        result: "Resultado",
        all: "TODOS",
        allF: "TODAS",
        ok: "OBLIGADO (ok)",
        cond: "CONDICIONADO (condicionado)",
        none: "- (sin resultados)",
        instruction: "Instrucción",
        shown: (cap: number, total: number) =>
          `Mostrando ${cap} de ${total}. Indica país o red para acotar.`,
        source:
          "Fuente: Listado oficial de gasolineras autorizadas (gasolineras.csv)",
        noMatch: [
          "No hay gasolineras que coincidan con tu consulta en el listado oficial.",
          "",
          "Sugerencia: indica país (España/Francia/Italia/...) o red (AS24/IDS/SOLRED).",
          "Fuente: Listado oficial de gasolineras autorizadas (gasolineras.csv)",
        ].join("\n"),
      };
  }
}

function renderItem(g: Gasolinera, lang: Lang): string {
  const s = STR(lang);
  const label = getStatus(g as any) === "ok" ? s.ok : s.cond;
  return `- ${g.id} · ${g.nombre} · ${g.red} · ${g.pais} · ${label}\n  ${s.instruction}: ${g.instrucciones}`;
}

export async function answerFromGasolineras(
  question: string,
  opts?: { query?: string; debug?: any; lang?: Lang }
) {
  const lang = opts?.lang ?? detectLang(question);
  const s = STR(lang);

  const q = opts?.query ?? question;
  const filters = parseGasFilters(q);
  const all = filterGasolineras(q).slice().sort(sortGas);

  if (!all.length) return { answer: s.noMatch, hits: [] };

  const cap = 12;
  const shown = all.slice(0, cap);

  const headerLines = [
    s.title,
    "",
    `${s.country}: ${filters.country ? filters.country.toUpperCase() : s.all}`,
    `${s.network}: ${filters.network ? filters.network.toUpperCase() : s.allF}`,
    `${s.status}: ${
      filters.status ? (filters.status === "ok" ? s.ok : s.cond) : s.all
    }`,
    `${s.result}: ${all.length} estaciones`,
    "",
  ];

  const ok = shown.filter((g) => getStatus(g as any) === "ok");
  const cond = shown.filter((g) => getStatus(g as any) === "condicionado");

  const blocks: string[] = [];

  if (!filters.status || filters.status === "ok") {
    blocks.push(`${s.ok}:`);
    blocks.push(ok.length ? ok.map((g) => renderItem(g, lang)).join("\n") : s.none);
    blocks.push("");
  }

  if (!filters.status || filters.status === "condicionado") {
    blocks.push(`${s.cond}:`);
    blocks.push(
      cond.length ? cond.map((g) => renderItem(g, lang)).join("\n") : s.none
    );
    blocks.push("");
  }

  if (all.length > cap) {
    blocks.push(s.shown(cap, all.length));
    blocks.push("");
  }

  blocks.push(s.source);

  return { answer: headerLines.concat(blocks).join("\n"), hits: shown };
}





