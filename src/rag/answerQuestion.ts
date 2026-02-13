// ==============================
// FILE: src/rag/answerQuestion.ts (GOLDEN BASELINE V20 - TYPES FINAL)
// ==============================
import { routeQuestion, type RouteResult } from "./routeQuestion";
import { answerFromManual } from "./answerFromManual";
import { answerFromGasolineras } from "./answerFromGasolineras";
import { translateToES } from "./translateToES";

// CORRECCIÓN 1: Importación de tipo explícita (Mantenemos esto que ya funcionó)
import type { Env } from "../index";

export async function answerQuestion(
  apiKey: string,
  question: string,
  env: Env,
  _opts?: { forcedLang?: any; debug?: boolean }
) {
  // CORRECCIÓN 2: Ajuste de firma de translateToES.
  // El error indicaba que el 2º argumento debe ser 'Lang', no 'string'.
  // Asumimos la firma: translateToES(text, sourceLang).
  // Usamos forcedLang si existe, o "es" como fallback seguro para satisfacer el tipo.
  const sourceLang = _opts?.forcedLang || "es";
  const esQuery = await translateToES(question, sourceLang as any);
  
  // 2. Decidir ruta (Manual vs Gasolineras)
  const rr: RouteResult = routeQuestion(esQuery);

  if (rr.route === "gasolineras") {
    // 3A. Ruta Gasolineras
    return await answerFromGasolineras(apiKey, esQuery, env); 
  } else {
    // 3B. Ruta Manual
    return await answerFromManual(apiKey, esQuery, env);
  }
}



