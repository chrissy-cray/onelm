import { NextResponse } from "next/server";
import { createServiceClient, storagePath, uploadToStorage, BUCKET } from "@/lib/supabase";
import { extractTextWithClaude } from "@/lib/anthropic";
import { withAuth, apiError } from "@/middleware/auth";
import type { AuthedRequest } from "@/middleware/auth";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export const POST = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const clientId = formData.get("clientId") as string | null;
    if (!file) return apiError("No file provided");
    if (!clientId) return apiError("clientId is required");
    if (file.size > MAX_FILE_SIZE) return apiError("File exceeds 20 MB limit");

    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("user_id", req.userId)
      .single();
    if (clientErr || !clientRow) return apiError("Client not found", 403);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const isPdf = file.type === "application/pdf";

    let extractedText = "";
    if (isPdf) {
      const base64 = buffer.toString("base64");
      extractedText = await extractTextWithClaude(base64, file.name);
    } else {
      extractedText = buffer.toString("utf-8");
    }

    if (!extractedText.trim()) return apiError("Could not extract text from this file");

    const path = storagePath(req.userId, clientId, file.name);
    await uploadToStorage(supabase, path, buffer, file.type);

    const { data: doc, error: dbErr } = await supabase
      .from("documents")
      .insert({
        client_id: clientId,
        user_id: req.userId,
        file_name: file.name,
        file_size: file.size,
        storage_path: path,
        extracted_text: extractedText,
        mime_type: file.type,
      })
      .select()
      .single();

    if (dbErr || !doc) {
      await supabase.storage.from(BUCKET).remove([path]);
      return apiError("Failed to save document", 500);
    }

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    console.error("[upload]", err);
    return apiError("Upload failed", 500);
  }
});

export const DELETE = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("documentId");
  if (!documentId) return apiError("documentId is required");
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("user_id", req.userId)
    .single();
  if (!doc) return apiError("Document not found", 404);
  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  await supabase.from("documents").delete().eq("id", documentId).eq("user_id", req.userId);
  return NextResponse.json({ deleted: true });
});
