type ResponseContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };

type ResponseInput = Array<{
  role: "user" | "developer" | "system";
  content: ResponseContentPart[];
}>;

export class OpenAIProviderError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super(`OpenAI error ${status}: ${details}`);
    this.name = "OpenAIProviderError";
    this.status = status;
    this.details = details;
  }
}

function getOpenAIBaseUrl(): string {
  return (Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
}

export function getOpenAIApiKey(): string {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return apiKey;
}

export function getOpenAITextModel(): string {
  return Deno.env.get("OPENAI_TRANSLATION_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini";
}

export function getOpenAIDocumentModel(): string {
  return Deno.env.get("OPENAI_DOCUMENT_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function extractOutputText(data: unknown): string {
  const root = asRecord(data);
  if (!root) throw new Error("OpenAI returned an invalid response");

  if (typeof root.output_text === "string" && root.output_text.trim()) {
    return root.output_text.trim();
  }

  const textParts: string[] = [];
  const output = Array.isArray(root.output) ? root.output : [];
  for (const rawItem of output) {
    const item = asRecord(rawItem);
    if (!item) continue;
    if (item.type !== "message") continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const rawPart of content) {
      const part = asRecord(rawPart);
      if (!part) continue;
      if (part.type === "output_text" && typeof part.text === "string") {
        textParts.push(part.text);
      }
    }
  }

  const text = textParts.join("").trim();
  if (!text) throw new Error("OpenAI returned empty content");
  return text;
}

async function createOpenAIResponse(
  apiKey: string,
  model: string,
  input: ResponseInput,
  maxOutputTokens?: number,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    input,
    store: false,
  };
  if (maxOutputTokens && Number.isFinite(maxOutputTokens)) {
    body.max_output_tokens = maxOutputTokens;
  }

  const response = await fetch(`${getOpenAIBaseUrl()}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new OpenAIProviderError(response.status, await response.text());
  }

  return extractOutputText(await response.json());
}

export async function generateText(
  apiKey: string,
  prompt: string,
  options: { model?: string; maxOutputTokens?: number } = {},
): Promise<string> {
  return createOpenAIResponse(
    apiKey,
    options.model || getOpenAITextModel(),
    [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    options.maxOutputTokens,
  );
}

export async function generateFromPdf(
  apiKey: string,
  prompt: string,
  fileBase64: string,
  options: { model?: string; filename?: string; maxOutputTokens?: number } = {},
): Promise<string> {
  return createOpenAIResponse(
    apiKey,
    options.model || getOpenAIDocumentModel(),
    [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: options.filename || "document.pdf",
            file_data: fileBase64,
          },
          { type: "input_text", text: prompt },
        ],
      },
    ],
    options.maxOutputTokens,
  );
}

export function isRateLimited(error: unknown): boolean {
  return error instanceof OpenAIProviderError
    ? error.status === 429
    : String(error).includes("429");
}
