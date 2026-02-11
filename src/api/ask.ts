// FILE: src/api/ask.ts
export type AskRoute = "manual" | "gasolineras" | "ambigua";

export type AskResponse = {
  answer: string;
  route?: AskRoute;
  hits?: any[];
};

type AskError = {
  message: string;
  status?: number;
  details?: unknown;
};

function envOrThrow(key: "VITE_API_URL" | "VITE_APP_TOKEN"): string {
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

export async function ask(question: string): Promise<AskResponse> {
  const q = String(question ?? "").trim();
  if (!q) throw new Error("La pregunta está vacía.");

  const url = envOrThrow("VITE_API_URL");
  const token = envOrThrow("VITE_APP_TOKEN");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-token": token,
      },
      body: JSON.stringify({ question: q }),
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
  };
}
