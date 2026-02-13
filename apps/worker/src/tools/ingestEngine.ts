// src/tools/ingestEngine.ts
import { Env } from "../index";
import { DATA } from "../../../../packages/data/manualV16";
import { GASOLINERAS } from "../../../../packages/data/gasolineras";

async function getEmbedding(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const json: any = await res.json();
  if (!json.data) throw new Error(`OpenAI: ${JSON.stringify(json)}`);
  return json.data[0].embedding;
}

export async function runIngest(env: Env, url: URL) {
  // Parámetros para evitar el error "Too many subrequests"
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const limit = parseInt(url.searchParams.get("limit") || "20");

  const items = [
    ...DATA.flatMap(cap => cap.secciones.map(sec => ({
      id: `m_${cap.id}_${Math.random().toString(36).substring(7)}`,
      text: `${cap.titulo} - ${sec.t}: ${sec.p.join(" ")}`,
      type: "manual"
    }))),
    ...GASOLINERAS.map(gas => ({
      id: `g_${gas.id}`,
      text: `Gasolinera: ${gas.nombre} (${gas.pais}). ${gas.instrucciones}`,
      type: "gasolineras"
    }))
  ];

  const slice = items.slice(offset, offset + limit);
  let count = 0;

  for (const item of slice) {
    const values = await getEmbedding(env.OPENAI_API_KEY, item.text);
    await env.VECTOR_INDEX.upsert([{
      id: item.id,
      values,
      metadata: { text: item.text, type: item.type }
    }]);
    count++;
  }

  return { 
    processed: count, 
    next_offset: offset + count, 
    total_items: items.length,
    finished: (offset + count) >= items.length 
  };
}
