type ChatMsg = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function openaiChat(
  apiKey: string,
  params: {
    model: string;
    temperature?: number;
    messages: ChatMsg[];
  }
): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature ?? 0,
      messages: params.messages,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${t.slice(0, 500)}`);
  }

  const json: any = await resp.json();

  const content = json?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("OpenAI returned empty content");
  }

  return content.trim();
}

