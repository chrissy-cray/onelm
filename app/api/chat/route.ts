import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getAnthropicClient, MODEL, MAX_TOKENS, chatSystemPrompt } from "@/lib/anthropic";
import { withAuth, apiError, checkRateLimit } from "@/middleware/auth";
import type { AuthedRequest } from "@/middleware/auth";

const ChatSchema = z.object({
  clientId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8000),
  })).max(20),
});

export const POST = withAuth(async (req: AuthedRequest) => {
  if (!checkRateLimit(req.userId)) return apiError("Too many requests", 429);
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const parsed = ChatSchema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);
    const { clientId, message, history } = parsed.data;

    const { data: client } = await supabase
      .from("clients").select("*").eq("id", clientId).eq("user_id", req.userId).single();
    if (!client) return apiError("Client not found", 403);

    const { data: docs } = await supabase
      .from("documents").select("id, file_name, extracted_text, created_at")
      .eq("client_id", clientId).eq("user_id", req.userId)
      .order("created_at", { ascending: true });

    const messages = [...history.slice(-20), { role: "user" as const, content: message }];
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: chatSystemPrompt(client, docs ?? []),
      messages,
    });

    const rawReply = response.content.map((b: any) => b.text ?? "").join("");
    const citeMatch = rawReply.match(/\[Source[s]?:\s*([^\]]+)\]/i);
    const citation = citeMatch ? citeMatch[1].trim() : null;
    const reply = rawReply.replace(/\[Source[s]?:[^\]]+\]/gi, "").trim();

    await supabase.from("messages").insert([
      { client_id: clientId, user_id: req.userId, role: "user", content: message, citation: null },
      { client_id: clientId, user_id: req.userId, role: "assistant", content: reply, citation },
    ]);

    return NextResponse.json({ reply, citation });
  } catch (err) {
    console.error("[chat]", err);
    return apiError("Chat failed", 500);
  }
});

export const GET = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return apiError("clientId is required");
  const { data, error } = await supabase
    .from("messages").select("*")
    .eq("client_id", clientId).eq("user_id", req.userId)
    .order("created_at", { ascending: true }).limit(100);
  if (error) return apiError("Failed to load messages", 500);
  return NextResponse.json({ messages: data ?? [] });
});
