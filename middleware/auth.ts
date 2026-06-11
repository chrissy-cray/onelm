import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export type AuthedRequest = NextRequest & { userId: string };

export function withAuth(
  handler: (req: AuthedRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const supabase = await createServerClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      (req as AuthedRequest).userId = session.user.id;
      return handler(req as AuthedRequest);
    } catch (err) {
      console.error("[withAuth]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}
