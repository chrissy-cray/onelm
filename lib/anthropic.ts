import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export const MODEL = "claude-sonnet-4-20250514";
export const MAX_TOKENS = 1500;

export function buildDocumentContext(docs: any[]): string {
  if (!docs.length) return "No documents uploaded yet.";
  return docs
    .map((d) => `=== ${d.file_name} ===\n${d.extracted_text}`)
    .join("\n\n")
    .slice(0, 60000);
}

export function chatSystemPrompt(client: any, docs: any[]): string {
  return `You are OneLM, an AI case assistant for personal injury law firms.

CLIENT: ${client.name}
DATE OF ACCIDENT: ${client.doa ?? "unknown"}
INJURY TYPE: ${client.injury_type ?? "unspecified"}
TOTAL DOCUMENTS: ${docs.length}

Answer questions using ONLY the uploaded case documents. Always cite sources with [Source: filename].
Flag critical items: deadlines, liability strength, damages gaps.
If information is not in the documents, say so clearly — never make up case facts.

CASE DOCUMENTS:
${buildDocumentContext(docs)}`;
}

export function summarySystemPrompt(client: any, docs: any[]): string {
  return `You are OneLM, an AI case assistant for personal injury law firms.
Generate a structured case summary for: ${client.name} (DOA: ${client.doa ?? "unknown"})

Sections:
1. INCIDENT OVERVIEW
2. LIABILITY ASSESSMENT
3. INJURIES & TREATMENT
4. DAMAGES TO DATE
5. PROJECTED DAMAGES
6. EVIDENCE STRENGTHS
7. EVIDENCE GAPS
8. RECOMMENDED NEXT STEPS

Cite document sources. If a section has no data write "Not yet documented."

CASE DOCUMENTS:
${buildDocumentContext(docs)}`;
}

export async function extractTextWithClaude(
  base64Pdf: string,
  fileName: string
): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
          } as any,
          {
            type: "text",
            text: `Extract ALL text from this document (${fileName}) as clean plain text. Return only the extracted text — no commentary.`,
          },
        ],
      },
    ],
  });
  return response.content.map((b: any) => b.text ?? "").join("");
}
