import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { withAuth, apiError } from "@/middleware/auth";
import type { AuthedRequest } from "@/middleware/auth";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  doa: z.string().nullable().optional(),
  injury_type: z.string().max(100).nullable().optional(),
  status: z.enum(["active", "review", "closed"]).default("active"),
});

export const GET = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", req.userId)
    .order("updated_at", { ascending: false });
  if (error) return apiError("Failed to load clients", 500);
  return NextResponse.json({ clients: data ?? [] });
});

export const POST = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.data, user_id: req.userId })
    .select()
    .single();
  if (error) return apiError("Failed to create client", 500);
  return NextResponse.json({ client: data }, { status: 201 });
});

export const PATCH = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return apiError("id is required");
  const { data, error } = await supabase
    .from("clients")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", req.userId)
    .select()
    .single();
  if (error) return apiError("Failed to update client", 500);
  return NextResponse.json({ client: data });
});

export const DELETE = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return apiError("clientId is required");
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("user_id", req.userId);
  if (error) return apiError("Failed to delete client", 500);
  return NextResponse.json({ deleted: true });
});
