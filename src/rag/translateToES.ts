// src/rag/translateToES.ts
import OpenAI from "openai";
import type { Lang } from "./lang";

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

// Cache simple para no traducir lo mismo 50 veces
const CACHE = new Map<string, string>();

/**
 * Traduce texto de (pt|ro|ar) -> ES SOLO para búsqueda.
 * - Conserva siglas, números, códigos (DTCO, UK, CMR, AS24, IDS, etc.).
 * - Devuelve una frase corta (query de búsqueda), no explicación.
 */
export async function translateToES(text: string, lang: Lang): Promise<string> {
  const input = (text ?? "").trim();
  if (!input) return "";
  if (lang === "es") return input;

  const key = `${lang}::${input}`;
  const cached = CACHE.get(key);
  if (cached) return cached;

  const system = [
    "Eres un traductor técnico.",
    "Traduce el TEXTO a español (ES).",
    "Devuelve SOLO la traducción, sin comillas, sin notas, sin formato.",
    "Mantén siglas/códigos/números tal cual (DTCO, UK, CMR, AS24, IDS, etc.).",
    "Si el texto ya contiene palabras en español, consérvalas.",
  ].join(" ");

  const resp = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
  });

  const out = (resp.choices[0]?.message?.content ?? input).trim() || input;
  CACHE.set(key, out);
  return out;
}
