import type { Env } from "../index"; // <--- USO DE "import type" (SOLUCIÓN ERROR ROJO)
import { openaiChat } from "./openai";
import { GASOLINERAS } from "../data/gasolineras";

interface VectorMatch {
  metadata?: { text?: string; type?: string };
}

export async function answerFromGasolineras(
  apiKey: string, 
  questionES: string, 
  env: Env
) {
  // 1. Normalización para búsqueda local (Coste 0)
  const query = questionES.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // --- FASE 1: BÚSQUEDA LOCAL ---
  const localMatches = GASOLINERAS.filter(g => {
    const pais = g.pais.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nombre = g.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return query.includes(pais) || query.includes(nombre);
  });

  if (localMatches.length > 0) {
    const list = localMatches.map(g => `- **${g.nombre}** (${g.pais}): ${g.instrucciones}`).join("\n");
    return {
      answer: `He encontrado estas estaciones en la fuente oficial (Búsqueda Local - Coste 0):\n\n${list}`,
      hits: localMatches.map(g => ({ id: g.id, metadata: { text: g.nombre, type: "local" } }))
    };
  }

  // --- FASE 2: BÚSQUEDA VECTORIAL (RESPALDO) ---
  const embReq = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: query })
  });

  const embJson: any = await embReq.json();
  if (!embReq.ok || !embJson?.data?.[0]) {
    throw new Error(`Error OpenAI: ${JSON.stringify(embJson)}`);
  }

  const matches = await env.VECTOR_INDEX.query(embJson.data[0].embedding, { topK: 5, returnMetadata: true });
  const gasHits = (matches.matches as VectorMatch[])
    .filter(m => m.metadata?.type === "gasolineras")
    .map(m => m.metadata?.text).join("\n\n");

  if (!gasHits) return { answer: "No hay resultados en la base de datos.", hits: [] };

  const answer = await openaiChat(apiKey, {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Asistente técnico de JCarrion. Resume las gasolineras encontradas." },
      { role: "user", content: `Contexto:\n${gasHits}\n\nPregunta: ${query}` }
    ]
  });

  return { answer, hits: matches.matches };
}





