import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { withAuth, apiError } from "@/middleware/auth";
import type { AuthedRequest } from "@/middleware/auth";

export const GET = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const { data: membership } = await supabase
    .from("team_members").select("firm_id, team_id, role")
    .eq("user_id", req.userId).limit(1).single();
  if (!membership) return apiError("User is not part of any firm", 403);
  const { data: teams, error } = await supabase
    .from("teams")
    .select("*, members:team_members(id, user_id, role, display_name, avatar_initials, created_at)")
    .eq("firm_id", membership.firm_id)
    .order("created_at", { ascending: true });
  if (error) return apiError("Failed to load teams", 500);
  return NextResponse.json({ teams: teams ?? [], firmId: membership.firm_id });
});

export const POST = withAuth(async (req: AuthedRequest) => {
  const supabase = createServiceClient();
  const body = await req.json();
  const action = body?.action ?? "create_team";

  if (action === "invite_member") {
    const schema = z.object({
      teamId: z.string().uuid(),
      userId: z.string().uuid(),
      displayName: z.string().min(1).max(100),
      avatarInitials: z.string().max(3).optional(),
      role: z.enum(["admin", "member"]).default("member"),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError(parsed.error.issues[0].message);
    const { data: team } = await supabase
      .from("teams").select("firm_id").eq("id", parsed.data.teamId).single();
    if (!team) return apiError("Team not found", 404);
    const { data, error } = await supabase
      .from("team_members")
      .insert({
        team_id: parsed.data.teamId,
        user_id: parsed.data.userId,
        firm_id: team.firm_id,
        role: parsed.data.role,
        display_name: parsed.data.displayName,
        avatar_initials: parsed.data.avatarInitials ?? parsed.data.displayName.slice(0, 2).toUpperCase(),
      })
      .select().single();
    if (error) {
      if (error.code === "23505") return apiError("User already in this team", 409);
      return apiError("Failed to add member", 500);
    }
    return NextResponse.json({ member: data }, { status: 201 });
  }

  if (action === "support_members") {
    const { data: membership } = await supabase
      .from("team_members").select("firm_id").eq("user_id", req.userId).limit(1).single();
    if (!membership) return apiError("Not a firm member", 403);
    const { data, error } = await supabase
      .from("team_members")
      .select("user_id, display_name, avatar_initials, team:teams(team_type)")
      .eq("firm_id", membership.firm_id);
    if (error) return apiError("Failed to load members", 500);
    const supportMembers = (data ?? []).filter(
      (m: any) => (m.team as any)?.team_type === "support"
    );
    return NextResponse.json({ members: supportMembers });
  }

  const schema = z.object({
    name: z.string().min(1).max(100),
    teamType: z.enum(["case_manager", "support", "admin", "general"]).default("general"),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message);
  const { data: membership } = await supabase
    .from("team_members").select("firm_id, role").eq("user_id", req.userId).limit(1).single();
  if (!membership) return apiError("Not a firm member", 403);
  if (membership.role === "member") return apiError("Only admins can create teams", 403);
  const { data, error } = await supabase
    .from("teams")
    .insert({ firm_id: membership.firm_id, name: parsed.data.name, team_type: parsed.data.teamType })
    .select().single();
  if (error) return apiError("Failed to create team", 500);
  return NextResponse.json({ team: data }, { status: 201 });
});
