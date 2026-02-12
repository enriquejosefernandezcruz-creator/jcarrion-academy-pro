import type { Env } from "../index"; // <--- USO DE "import type" (SOLUCIÓN ERROR ROJO)
import { openaiChat } from "./openai";

export async function answerFromManual(
  apiKey: string, 
  question: string, 
  env: Env
) {
  const embReq = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: question })
  });

  const embJson: any = await embReq.json();
  
  if (!embReq.ok || !embJson?.data?.[0]) {
      throw new Error("Error generando embeddings en manual");
  }

  const vector = embJson.data[0].embedding;

  const matches = await env.VECTOR_INDEX.query(vector, { topK: 5, returnMetadata: true });
  
  // Filtrar solo contenido del manual
  const context = matches.matches
    .filter((m: any) => m.metadata?.type === "manual")
    .map((m: any) => m.metadata?.text).join("\n\n");

  const answer = await openaiChat(apiKey, {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Eres un instructor experto. Responde basándote SOLO en el contexto proporcionado." },
      { role: "user", content: `Manual:\n${context}\n\nPregunta: ${question}` }
    ]
  });

  return { answer, hits: matches.matches };
}







