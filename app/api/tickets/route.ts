import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { withAuth, apiError, checkRateLimit } from "@/middleware/auth";
import { notify } from "@/lib/notifications";
import type { AuthedRequest } from "@/middleware/auth";

const CreateSchema = z.object({
  clientId: z.string().uuid(),
  assignedTo: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(1000).optional(),
  documentType: z.string().max(100).optional(),
  milestoneId: z.string().uuid().optional(),
  priority: z.enum(["low", "normal", "urgent"]).default("normal"),
  dueDate: z.string().optional(),
});

export const GET = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "mine";
  const clientId = searchParams.get("clientId");
  const { data: membership } = await supabase
    .from("team_members").select("firm_id").eq("user_id", req.userId).limit(1).single();
  if (!membership) return apiError("Not a firm member", 403);
  let query = supabase.from("tickets")
    .select("*, client:clients(name, doa)")
    .eq("firm_id", membership.firm_id)
    .order("created_at", { ascending: false });
  if (view === "mine") query = query.eq("assigned_to", req.userId);
  if (view === "sent") query = query.eq("assigned_by", req.userId);
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query.limit(100);
  if (error) return apiError("Failed to load tickets", 500);
  return NextResponse.json({ tickets: data ?? [] });
});

export const POST = withAuth(async (req: AuthedRequest) => {
  if (!checkRateLimit(req.userId)) return apiError("Rate limit exceeded", 429);
  const supabase = createServiceClient();
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);
  const { clientId, assignedTo, title, description, documentType, milestoneId, priority, dueDate } = parsed.data;
  const { data: membership } = await supabase
    .from("team_members").select("firm_id, display_name").eq("user_id", req.userId).limit(1).single();
  if (!membership) return apiError("Not a firm member", 403);
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", clientId).single();
  if (!client) return apiError("Client not found", 404);
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      firm_id: membership.firm_id,
      client_id: clientId,
      milestone_id: milestoneId ?? null,
      assigned_by: req.userId,
      assigned_to: assignedTo,
      title,
      description: description ?? null,
      document_type: documentType ?? null,
      priority,
      due_date: dueDate ?? null,
      status: "open",
    })
    .select().single();
  if (error || !ticket) return apiError("Failed to create ticket", 500);
  if (milestoneId) {
    await supabase.from("milestones")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", milestoneId);
  }
  await notify({
    supabase, userId: assignedTo, firmId: membership.firm_id,
    type: "ticket_assigned", title: `New task: ${title}`,
    body: client.name, ticketId: ticket.id, clientId,
  });
  return NextResponse.json({ ticket }, { status: 201 });
});

export const PATCH = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const body = await req.json();
  if (body.action === "complete") {
    const parsed = z.object({
      ticketId: z.string().uuid(),
      completionNote: z.string().max(1000).optional(),
      documentId: z.string().uuid().optional(),
    }).safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);
    const { ticketId, completionNote, documentId } = parsed.data;
    const { data: ticket } = await supabase
      .from("tickets").select("*, client:clients(name)")
      .eq("id", ticketId).eq("assigned_to", req.userId).single();
    if (!ticket) return apiError("Ticket not found", 404);
    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("tickets")
      .update({ status: "done", completed_at: now, completed_by: req.userId, completion_note: completionNote ?? null, document_id: documentId ?? null, updated_at: now })
      .eq("id", ticketId).select().single();
    if (error) return apiError("Failed to complete ticket", 500);
    if (ticket.milestone_id) {
      await supabase.from("milestones")
        .update({ status: "done", completed_by: req.userId, completed_at: now, document_id: documentId ?? null, updated_at: now })
        .eq("id", ticket.milestone_id);
    }
    const { data: membership } = await supabase
      .from("team_members").select("firm_id").eq("user_id", req.userId).limit(1).single();
    if (membership) {
      await notify({
        supabase, userId: ticket.assigned_by, firmId: membership.firm_id,
        type: "ticket_completed", title: `Task complete: ${ticket.title}`,
        body: completionNote ?? "Document uploaded to notebook",
        ticketId: ticket.id, clientId: ticket.client_id,
      });
    }
    return NextResponse.json({ ticket: updated });
  }
  const { ticketId, ...updates } = body;
  if (!ticketId) return apiError("ticketId is required");
  const { data, error } = await supabase
    .from("tickets").update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", ticketId)
    .or(`assigned_by.eq.${req.userId},assigned_to.eq.${req.userId}`)
    .select().single();
  if (error) return apiError("Failed to update ticket", 500);
  return NextResponse.json({ ticket: data });
});

export const DELETE = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const ticketId = searchParams.get("ticketId");
  if (!ticketId) return apiError("ticketId is required");
  await supabase.from("tickets")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", ticketId).eq("assigned_by", req.userId);
  return NextResponse.json({ cancelled: true });
});
