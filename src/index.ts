/// <reference types="@cloudflare/workers-types" />
import { answerFromGasolineras } from "./rag/answerFromGasolineras";
import { answerFromManual } from "./rag/answerFromManual";

// Definición de las variables de entorno para TypeScript
export interface Env {
  VECTOR_INDEX: VectorizeIndex;
  AI: any;
  OPENAI_API_KEY: string;
}

// Configuración de cabeceras CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-app-token",
};

export default {
  // Usamos _ctx con guion bajo para indicar que no lo usamos y quitar el warning
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    
    // 1. Gestión de CORS (Pre-flight)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 2. Verificación de Seguridad (Token MASTER)
    const token = request.headers.get("x-app-token");
    if (token !== "JCAP-MASTER-a77b56efa26446968f765f922c141a78") {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid Token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Enrutamiento de Peticiones
    if (url.pathname === "/api/ask" && request.method === "POST") {
      try {
        const body: any = await request.json();
        const question = body.question || "";
        
        // Detección básica de intención
        const lowerQ = question.toLowerCase();
        let result;

        const keywordsGas = ["gasolinera", "repostar", "gasoil", "diesel", "españa", "francia", "italia", "croacia", "litros", "tanque", "llenar"];
        const isGas = keywordsGas.some(kw => lowerQ.includes(kw));

        if (isGas) {
            // Llama al motor híbrido
            result = await answerFromGasolineras(env.OPENAI_API_KEY, question, env);
        } else {
            // Llama al manual técnico
            result = await answerFromManual(env.OPENAI_API_KEY, question, env);
        }

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Ruta por defecto (404)
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};