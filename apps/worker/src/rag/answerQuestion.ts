// ==============================
// FILE: src/rag/answerQuestion.ts (GOLDEN BASELINE V22 - FINAL SYNC)
// ==============================
import { routeQuestion, type RouteResult } from "./routeQuestion";
import { answerFromManual } from "./answerFromManual";
import { answerFromGasolineras } from "./answerFromGasolineras";
import { translateToES } from "./translateToES";

// Importación de tipo explícita para evitar error de 'verbatimModuleSyntax'
import type { Env } from "../index";

export async function answerQuestion(
  apiKey: string,
  question: string,
  env: Env,
  _opts?: { forcedLang?: any; debug?: boolean }
) {
  // CORRECCIÓN DEFINITIVA: 
  // Basado en el último error "Expected 3 arguments", la función requiere (apiKey, texto, idioma).
  // Usamos "as any" en "es" para evitar conflictos si el tipo Lang es un enum estricto.
  const esQuery = await translateToES(apiKey, question, "es" as any);
  
  // 2. Decidir ruta (Manual vs Gasolineras)
  const rr: RouteResult = routeQuestion(esQuery);

  if (rr.route === "gasolineras") {
    // 3A. Ruta Gasolineras: Requiere 3 argumentos (apiKey, pregunta, env)
    return await answerFromGasolineras(apiKey, esQuery, env); 
  } else {
    // 3B. Ruta Manual: Requiere 3 argumentos (apiKey, pregunta, env)
    return await answerFromManual(apiKey, esQuery, env);
  }
}





