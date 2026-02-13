// worker/src/rag/translateToES.ts
import type { Lang } from "./lang";
import { openaiChat } from "./openai";

// Cache in-memory simple (piloto). Clave: lang::texto
const CACHE = new Map<string, { v: string; exp: number }>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

function get(key: string): string | null {
  const it = CACHE.get(key);
  if (!it) return null;
  if (Date.now() > it.exp) {
    CACHE.delete(key);
    return null;
  }
  return it.v;
}
function set(key: string, v: string) {
  CACHE.set(key, { v, exp: Date.now() + TTL_MS });
}

export async function translateToES(apiKey: string, text: string, lang: Lang): Promise<string> {
  const input = (text ?? "").trim();
  if (!input) return "";
  if (lang === "es") return input;

  const key = `${lang}::${input}`;
  const cached = get(key);
  if (cached) return cached;

  const system = [
    "Eres un traductor técnico.",
    "Traduce el TEXTO a español (ES).",
    "Devuelve SOLO la traducción, sin comillas, sin notas, sin formato.",
    "Mantén siglas/códigos/números tal cual (DTCO, UK, CMR, AS24, IDS, etc.).",
    "Si el texto ya contiene palabras en español, consérvalas.",
    "Devuelve una frase corta (query de búsqueda), no explicación.",
  ].join(" ");

  const out = (await openaiChat(apiKey, {
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
  })).trim() || input;

  set(key, out);
  return out;
}
