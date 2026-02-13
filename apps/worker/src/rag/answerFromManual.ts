// ==============================
// FILE: src/engines/answerFromManual.ts (GOLDEN BASELINE V25 - SWITZERLAND RULE + ROBUST HITS)
// ==============================
import { Env } from "../index";
import { openaiChat } from "./openai";

function buildSystemPrompt(): string {
  // V25: Regla de negocio inyectada (Suiza incluida en telepeaje)
  // Nota: esto es "conocimiento operativo" permitido aunque el manual no lo cite en contexto.
  return `Eres un instructor experto de JCarrión Academy.
Responde basándote SOLO en el contexto del manual proporcionado.
Si la respuesta no está en el manual, indícalo educadamente.
Mantén un tono profesional, directo y aséptico.

REGLA OPERATIVA (TELEPEAJE Y SUIZA):
- Los dispositivos de telepeaje actuales incluyen Suiza.
- No hace falta realizar ningún trámite manual adicional para Suiza.
- Si preguntan por "activar Suiza" o "pagar peajes en Suiza", indica que ya está incluido y que debe seguir el procedimiento normal de uso del dispositivo según el manual.`;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeLabel(s: string): string {
  return safeStr(s).replace(/\s+/g, " ");
}

export async function answerFromManual(apiKey: string, question: string, env: Env) {
  // 1. Generación de Embedding
  const embReq = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: question }),
  });

  if (!embReq.ok) {
    throw new Error(`OpenAI Embedding Error: ${embReq.statusText}`);
  }

  const embJson: any = await embReq.json();
  const vector = embJson.data?.[0]?.embedding;

  if (!Array.isArray(vector)) {
    throw new Error("OpenAI Embedding Error: embedding vector inválido");
  }

  // 2. Consulta a Vectorize con Metadatos
  const matches = await env.VECTOR_INDEX.query(vector, {
    topK: 5,
    returnMetadata: true,
  });

  // 3. Preparación de Contexto y Mapeo de Hits para el Frontend
  const allMatches = Array.isArray(matches?.matches) ? matches.matches : [];
  const manualMatches = allMatches.filter((m: any) => m?.metadata?.type === "manual");

  // Contexto: prioriza title real y texto
  const context = manualMatches
    .map((m: any) => {
      const title = normalizeLabel(String(m?.metadata?.title ?? "")) || "Documento sin título";
      const text = normalizeLabel(String(m?.metadata?.text ?? ""));
      return `[FUENTE: ${title}] Content: ${text}`;
    })
    .join("\n\n");

  // 4. Prompt de Sistema (V25)
  const systemPrompt = buildSystemPrompt();

  const answer = await openaiChat(apiKey, {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Contexto del Manual:\n${context}\n\nPregunta: ${question}`,
      },
    ],
  });

  // 5. Retorno de hits robustos (title real + section)
  // - NO forzamos "Módulo Técnico" si existe title.
  // - Fallback final solo si no hay nada.
  const hits = manualMatches.map((m: any) => {
    const title =
      normalizeLabel(String(m?.metadata?.title ?? "")) ||
      normalizeLabel(String(m?.metadata?.source ?? "")) ||
      "Módulo Técnico";

    const section =
      normalizeLabel(String(m?.metadata?.section ?? "")) ||
      normalizeLabel(String(m?.metadata?.seccion ?? "")) ||
      "";

    return {
      id: m?.id,
      score: m?.score,
      metadata: {
        title,
        section,
      },
    };
  });

  return { answer, hits };
}

