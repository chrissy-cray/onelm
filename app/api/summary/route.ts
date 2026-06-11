import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getAnthropicClient, MODEL, summarySystemPrompt } from "@/lib/anthropic";
import { withAuth, apiError } from "@/middleware/auth";
import type { AuthedRequest } from "@/middleware/auth";

export const POST = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  try {
    const body = await req.json();
    const parsed = z.object({ clientId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);
    const { clientId } = parsed.data;

    const { data: client } = await supabase
      .from("clients").select("*").eq("id", clientId).eq("user_id", req.userId).single();
    if (!client) return apiError("Client not found", 403);

    const { data: docs } = await supabase
      .from("documents").select("id, file_name, extracted_text, created_at")
      .eq("client_id", clientId).eq("user_id", req.userId)
      .order("created_at", { ascending: true });

    if (!docs?.length) return apiError("No documents found — upload documents first");

    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: summarySystemPrompt(client, docs),
      messages: [{ role: "user", content: "Generate the full case summary now." }],
    });

    const summary = response.content.map((b: any) => b.text ?? "").join("");
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("[summary]", err);
    return apiError("Summary generation failed", 500);
  }
});
