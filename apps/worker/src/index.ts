// ==============================
// FILE: src/index.ts (GOLDEN BASELINE V25 - HITS NORMALIZER + DEBUG INSPECT)
// ==============================
/// <reference types="@cloudflare/workers-types" />
import { answerQuestion } from "./rag/answerQuestion";
import { AccessControlDO } from "./accessControlDO";
import { runIngest } from "./tools/ingestEngine";

export { AccessControlDO };

/**
 * Interfaz de Entorno Global
 */
export interface Env {
  OPENAI_API_KEY: string;
  APP_TOKENS_JSON: string;
  ACCESS_CONTROL: DurableObjectNamespace;
  VECTOR_INDEX: VectorizeIndex;
}

type AnyHit = {
  id?: unknown;
  score?: unknown;
  metadata?: Record<string, unknown>;
  [k: string]: unknown;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pickTitleFromMetadata(meta: Record<string, unknown> | undefined, hit: AnyHit): string {
  const m = meta ?? {};

  // Prioridad: title real (Vectorize DEFCON1) > source > module/moduloTitulo/name > legacy fields
  const candidates = [
    m["title"],
    m["source"],
    m["module"],
    m["moduloTitulo"],
    m["name"],
    hit["moduloTitulo"],
    hit["title"],
  ];

  for (const c of candidates) {
    const s = asTrimmedString(c);
    if (s) return s;
  }

  return ""; // sin fallback “Módulo Técnico” en backend
}

function pickSectionFromMetadata(meta: Record<string, unknown> | undefined, hit: AnyHit): string {
  const m = meta ?? {};

  const candidates = [
    m["section"],
    m["seccion"],
    m["subtitle"],
    hit["seccionTitulo"],
    hit["section"],
  ];

  for (const c of candidates) {
    const s = asTrimmedString(c);
    if (s) return s;
  }

  return "";
}

function normalizeHitsForUI(input: unknown): AnyHit[] {
  if (!Array.isArray(input)) return [];

  return (input as AnyHit[])
    .map((h) => {
      const meta = (h?.metadata && typeof h.metadata === "object") ? (h.metadata as Record<string, unknown>) : undefined;

      const title = pickTitleFromMetadata(meta, h);
      const section = pickSectionFromMetadata(meta, h);

      // Mantener metadata original, pero asegurar title/section coherentes si existen
      const outMeta: Record<string, unknown> = { ...(meta ?? {}) };

      // Backend NO debe inventar “Módulo Técnico”.
      // Si no hay title real, lo omitimos y dejamos que UI haga fallback.
      if (title) outMeta.title = title;
      else delete outMeta.title;

      if (section) outMeta.section = section;
      else if ("section" in outMeta) delete outMeta.section;

      return {
        id: h?.id,
        score: h?.score,
        metadata: outMeta,
      };
    })
    // Limpieza adicional: descartar hits sin metadata útil (opcional, pero reduce ruido)
    .filter((h) => {
      const meta = h?.metadata;
      return meta && typeof meta === "object" && Object.keys(meta).length > 0;
    });
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // 1. GESTIÓN DE CORS: Manejo de Preflight (Peticiones OPTIONS)
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-app-token, x-admin-key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 2. RUTA DE INGESTA ADMINISTRATIVA (DEFCON1)
    if (url.pathname === "/api/admin/ingest") {
      const auth = req.headers.get("x-admin-key");

      if (auth !== "DEFCON1") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      try {
        const stats = await runIngest(env, url);
        return new Response(JSON.stringify({ ok: true, stats }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // 3. RUTA PRINCIPAL DE CONSULTA (RAG)
    if (req.method === "POST" && url.pathname === "/api/ask") {
      try {
        const body: any = await req.json();
        const appToken = req.headers.get("x-app-token");

        // Debug activable por body.debug o query ?debug=1
        const debug =
          body?.debug === true ||
          body?.debug === 1 ||
          body?.debug === "1" ||
          url.searchParams.get("debug") === "1";

        // AUDITOR: Validación de seguridad mínima
        if (!appToken) {
          return new Response(JSON.stringify({ error: "Missing x-app-token" }), {
            status: 401,
            headers: { "content-type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
          });
        }

        if (!body.question) {
          return new Response(JSON.stringify({ error: "No question provided" }), {
            status: 400,
            headers: { "content-type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
          });
        }

        // Ejecución de la orquestación RAG
        const res: any = await answerQuestion(env.OPENAI_API_KEY, body.question, env, {
          forcedLang: body.lang,
          debug,
        });

        // V25: normalización server-side de hits (evita “Módulo Técnico” fabricado en backend)
        const normalizedHits = normalizeHitsForUI(res?.hits);
        res.hits = normalizedHits;

        // Debug: log de estructura real que llega desde el motor (sin exponer tokens)
        if (debug) {
          const preview = normalizedHits.slice(0, 5).map((h: AnyHit) => ({
            id: h.id,
            score: h.score,
            metadataKeys: h.metadata ? Object.keys(h.metadata) : [],
            title: (h.metadata && typeof h.metadata === "object") ? (h.metadata as any).title : undefined,
            section: (h.metadata && typeof h.metadata === "object") ? (h.metadata as any).section : undefined,
          }));

          console.log("[JCAP][debug] question:", String(body.question));
          console.log("[JCAP][debug] hitsPreview:", JSON.stringify(preview));

          // Si quieres verlo también en el cliente, lo añadimos solo cuando debug está activo.
          res._debug = { hitsPreview: preview };
        }

        return new Response(JSON.stringify(res), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // 4. RESPUESTA POR DEFECTO
    return new Response("JCAP API Gateway - Active", {
      status: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  },
};




