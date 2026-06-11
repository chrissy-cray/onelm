import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { withAuth, apiError } from "@/middleware/auth";
import type { AuthedRequest } from "@/middleware/auth";

export const GET = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return apiError("clientId is required");
  const { data, error } = await supabase
    .from("milestones").select("*, document:documents(file_name)")
    .eq("client_id", clientId).order("sort_order", { ascending: true });
  if (error) return apiError("Failed to load milestones", 500);
  return NextResponse.json({ milestones: data ?? [] });
});

export const POST = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const body = await req.json();
  const { data: membership } = await supabase
    .from("team_members").select("firm_id").eq("user_id", req.userId).limit(1).single();
  if (!membership) return apiError("Not a firm member", 403);

  if (body.action === "bulk_from_templates") {
    const parsed = z.object({ clientId: z.string().uuid(), templateIds: z.array(z.string().uuid()) }).safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);
    const { data: templates } = await supabase
      .from("milestone_templates").select("*")
      .eq("firm_id", membership.firm_id).in("id", parsed.data.templateIds)
      .order("default_order", { ascending: true });
    if (!templates?.length) return apiError("No templates found", 404);
    const rows = templates.map((t: any, i: number) => ({
      client_id: parsed.data.clientId, firm_id: membership.firm_id,
      template_id: t.id, name: t.name, sort_order: t.default_order ?? i, status: "waiting",
    }));
    const { data, error } = await supabase.from("milestones").insert(rows).select();
    if (error) return apiError("Failed to create milestones", 500);
    return NextResponse.json({ milestones: data }, { status: 201 });
  }

  const parsed = z.object({
    clientId: z.string().uuid(),
    name: z.string().min(1).max(200),
    templateId: z.string().uuid().optional(),
    sortOrder: z.number().int().default(0),
  }).safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);
  const { data, error } = await supabase
    .from("milestones")
    .insert({ client_id: parsed.data.clientId, firm_id: membership.firm_id, template_id: parsed.data.templateId ?? null, name: parsed.data.name, sort_order: parsed.data.sortOrder, status: "waiting" })
    .select().single();
  if (error) return apiError("Failed to create milestone", 500);
  return NextResponse.json({ milestone: data }, { status: 201 });
});

export const PATCH = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const body = await req.json();
  const { milestoneId, ...updates } = body;
  if (!milestoneId) return apiError("milestoneId is required");
  const payload: any = { ...updates, updated_at: new Date().toISOString() };
  if (updates.status === "done") {
    payload.completed_by = req.userId;
    payload.completed_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("milestones").update(payload).eq("id", milestoneId).select().single();
  if (error) return apiError("Failed to update milestone", 500);
  return NextResponse.json({ milestone: data });
});

export const DELETE = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const milestoneId = searchParams.get("milestoneId");
  if (!milestoneId) return apiError("milestoneId is required");
  await supabase.from("milestones").delete().eq("id", milestoneId);
  return NextResponse.json({ deleted: true });
});
