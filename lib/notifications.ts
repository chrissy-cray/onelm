import type { SupabaseClient } from "@supabase/supabase-js";

interface NotifyParams {
  supabase: SupabaseClient;
  userId: string;
  firmId: string;
  type: string;
  title: string;
  body?: string;
  ticketId?: string;
  clientId?: string;
}

export async function notify(params: NotifyParams): Promise<void> {
  const { supabase, userId, firmId, type, title, body, ticketId, clientId } = params;
  await supabase.from("notifications").insert({
    user_id: userId,
    firm_id: firmId,
    type,
    title,
    body: body ?? null,
    ticket_id: ticketId ?? null,
    client_id: clientId ?? null,
    read: false,
  });
}
