export type LlmGenerateInput = {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model: string;
  temperature?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens?: number;
  response_format?:
    | { type: "text" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          strict?: boolean;
          schema: Record<string, unknown>;
        };
      };
};

export type LlmClient = {
  generate: (input: LlmGenerateInput) => Promise<string>;
};

export const llm: LlmClient = {
  async generate(input) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set.");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature ?? 0.9,
        presence_penalty: input.presence_penalty ?? 0.7,
        frequency_penalty: input.frequency_penalty ?? 0.7,
        max_tokens: input.max_tokens,
        messages: [{ role: "system", content: input.system }, ...input.messages],
        response_format: input.response_format,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM call failed: ${response.status} ${text}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("LLM returned empty content.");
    return text;
  },
};
