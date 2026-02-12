// FILE: src/api/ask.ts
import { getStoredToken } from "../components/AccessGate";

export type AskRoute = "manual" | "gasolineras" | "ambigua";
export type Lang = "es" | "pt" | "ro" | "ar";

export type AskResponse = {
  answer: string;
  route?: AskRoute;
  hits?: any[];
  lang?: Lang;
  answer_es?: string;
};

type AskError = {
  message: string;
  status?: number;
  details?: unknown;
};

function envOrThrow(key: "VITE_API_URL"): string {
  const v = (import.meta as any).env?.[key] as string | undefined;
  if (!v || !String(v).trim()) throw new Error(`Falta variable de entorno: ${key}`);
  return String(v).trim();
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function tryParseJson(text: string): any | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Detecta idioma por CONTENIDO de la pregunta (no por idioma del teléfono).
 * Esto evita que un usuario con móvil en ES reciba respuestas en ES al preguntar en RO/PT/AR.
 */
function detectLangFromText(q: string): Lang {
  const s = String(q ?? "").trim();
  if (!s) return "es";

  // AR
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(s)) return "ar";

  const lower = s.toLowerCase();

  // RO con diacríticos
  if (/[ăâîșşțţ]/i.test(lower)) return "ro";

  // PT con diacríticos o tokens frecuentes
  if (
    /[ãõç]/i.test(lower) ||
    /\b(o que|você|voce|vocês|nao|não|pra|tá|tô|está|estão|por favor|obrigado|obrigada)\b/i.test(lower) ||
    /\b(viagem|durante|multa|multado|multada|estrada|rota|faço|fazer|recebi|receber)\b/i.test(lower)
  ) {
    return "pt";
  }

  // Señales RO sin diacríticos (caso común en teclado ES)
  const norm = ` ${lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

  const roSignals = [
    " care ",
    " este ",
    " dupa ",
    " cat ",
    " timp ",
    " saptamanal ",
    " pauza ",
    " minute ",
    " sofer ",
    " conducere ",
    " obligatoriu ",
    " numarul ",
    " maxim ",
  ];

  const roHits = roSignals.reduce((acc, t) => acc + (norm.includes(t) ? 1 : 0), 0);
  if (roHits >= 2) return "ro";

  return "es";
}

export async function ask(question: string): Promise<AskResponse> {
  const q = String(question ?? "").trim();
  if (!q) throw new Error("La pregunta está vacía.");

  const url = envOrThrow("VITE_API_URL");

  // Token por usuario (login en frontend)
  const token = getStoredToken();
  if (!token) {
    const err: AskError = { message: "No hay token de acceso. Inicia sesión." };
    throw err;
  }

  // NUEVO: idioma por texto (no por idioma del navegador)
  const lang = detectLangFromText(q);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-token": token,
      },
      body: JSON.stringify({
        question: q,
        lang,
        debug: false,
      }),
    });
  } catch (e: any) {
    const err: AskError = { message: "Error de red al contactar con la API.", details: e };
    throw err;
  }

  const text = await safeReadText(res);
  const parsed = tryParseJson(text);

  if (!res.ok) {
    const err: AskError = {
      message: `Error HTTP ${res.status} al consultar la API.`,
      status: res.status,
      details: parsed ?? text,
    };
    throw err;
  }

  const data = (parsed ?? {}) as Partial<AskResponse>;
  if (!data.answer || typeof data.answer !== "string") {
    const err: AskError = {
      message: "Respuesta inválida: falta 'answer'.",
      status: res.status,
      details: parsed ?? text,
    };
    throw err;
  }

  return {
    answer: data.answer,
    route: data.route,
    hits: Array.isArray(data.hits) ? data.hits : undefined,
    lang: data.lang as Lang | undefined,
    answer_es: typeof (data as any).answer_es === "string" ? (data as any).answer_es : undefined,
  };
}



