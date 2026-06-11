import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { withAuth, apiError } from "@/middleware/auth";
import type { AuthedRequest } from "@/middleware/auth";

export const GET = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";
  let query = supabase.from("notifications").select("*")
    .eq("user_id", req.userId).order("created_at", { ascending: false }).limit(50);
  if (unreadOnly) query = query.eq("read", false);
  const { data, error } = await query;
  if (error) return apiError("Failed to load notifications", 500);
  const unreadCount = (data ?? []).filter((n: any) => !n.read).length;
  return NextResponse.json({ notifications: data ?? [], unreadCount });
});

export const PATCH = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const notificationId = body?.notificationId as string | undefined;
  let query = supabase.from("notifications").update({ read: true }).eq("user_id", req.userId);
  if (notificationId) query = query.eq("id", notificationId);
  await query;
  return NextResponse.json({ ok: true });
});
