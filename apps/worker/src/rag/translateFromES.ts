import type { Lang } from "./lang";
import { openaiChat } from "./openai";

// Cache simple en memoria (Worker runtime)
const CACHE = new Map<string, { v: string; exp: number }>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

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

function targetName(lang: Lang): string {
  switch (lang) {
    case "pt":
      return "Portuguese";
    case "ro":
      return "Romanian";
    case "ar":
      return "Arabic";
    default:
      return "Spanish";
  }
}

export async function translateFromES(
  apiKey: string,
  textES: string,
  target: Lang
): Promise<string> {
  const input = (textES ?? "").trim();
  if (!input) return "";

  // Si el destino es español no traducimos
  if (target === "es") return input;

  const cacheKey = `${target}::${input}`;
  const cached = get(cacheKey);
  if (cached) return cached;

 const system = `
You are a strict professional translator.

Translate the following text FROM Spanish INTO ${targetName(target)}.

Rules:
- Output ONLY the translation.
- Do NOT repeat the original Spanish.
- Do NOT explain.
- Keep formatting, line breaks and bullet structure.
- Keep acronyms and codes unchanged (CMR, UK, AS24, IDS, DTCO, etc).

CRITICAL:
- Do NOT translate the "Referencias:" section content.
- Keep exactly the lines after "Referencias:" unchanged (module titles, section titles, numbers).
`;


  const response = await openaiChat(apiKey, {
    model: "gpt-4.1-mini",
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
  });

  const out =
    response && response.trim().length > 0
      ? response.trim()
      : input;

  set(cacheKey, out);
  return out;
}


