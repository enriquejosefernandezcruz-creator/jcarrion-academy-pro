// src/rag/answerQuestion.ts
import { routeQuestion, type Route, type RouteResult } from "./routeQuestion";
import { answerFromManual } from "./answerFromManual";
import { answerFromGasolineras } from "./answerFromGasolineras";
import { detectLang, type Lang } from "./lang";
import { translateToES } from "./translateToES";

export async function answerQuestion(
  question: string
): Promise<{ answer: string; route: Route; hits?: any[] }> {
  const lang: Lang = detectLang(question);
  const rr: RouteResult = routeQuestion(question);

  // Parche de seguridad: intención clara de gas -> gasolineras
  const qn = (rr.expanded ?? question).toLowerCase();
  const forceGas =
    /\b(donde|dónde|cerca|listado|mapa|ubicacion|ubicación|localizar|estaciones)\b/.test(
      qn
    ) &&
    /\b(repostar|repostaje|gasolinera|gasolineras|gasoil|diesel|as24|ids|solred|cepsa|esso|q8)\b/.test(
      qn
    );

  if (forceGas && rr.route !== "gasolineras") rr.route = "gasolineras";

  if (rr.route === "ambigua") {
    return {
      route: rr.route,
      answer: [
        "Tu pregunta mezcla 2 dominios (normativa del manual y repostaje).",
        "",
        "Elige UNA opción y repite la pregunta:",
        "- A) Repostaje (gasolineras autorizadas)",
        "- B) Manual V16 (normativa/operativa)",
      ].join("\n"),
      hits: [],
    };
  }

  // Normalización: traducir SOLO para búsqueda (no para la respuesta)
  // Usamos rr.expanded (mejor recall) y lo traducimos a ES si hace falta.
  const expanded = rr.expanded ?? question;

  if (rr.route === "gasolineras") {
    const esQuery = await translateToES(expanded, lang);
    const res = await answerFromGasolineras(question, {
      query: esQuery,
      debug: { ...rr, esQuery },
      lang,
    });
    return { ...res, route: rr.route };
  }

  // MANUAL
  const esQuery = await translateToES(expanded, lang);
  const res = await answerFromManual(question, {
    query: esQuery,
    debug: { ...rr, esQuery },
    lang,
  });
  return { ...res, route: rr.route };
}



