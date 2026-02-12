export async function openaiChat(apiKey: string, body: any) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const json: any = await resp.json();

  if (!resp.ok) {
    throw new Error(`OpenAI Error: ${json.error?.message || JSON.stringify(json)}`);
  }

  return json.choices[0].message.content;
}