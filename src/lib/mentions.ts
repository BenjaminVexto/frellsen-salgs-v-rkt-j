import { supabase } from "@/integrations/supabase/client";

export type MentionableUser = {
  id: string;
  full_name: string;
  first_name: string;
};

export function firstNameOf(full: string): string {
  return (full || "").trim().split(/\s+/)[0] ?? "";
}

/** Extract @Firstname tokens from a note (letters incl. æøå). */
export function extractMentions(text: string): string[] {
  const re = /@([A-Za-zÆØÅæøåÉéÄäÖöÜü][A-Za-zÆØÅæøåÉéÄäÖöÜü\-]*)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return Array.from(new Set(out));
}

/**
 * Match mention strings against users by first name (case-insensitive).
 * If multiple users share the same first name, all of them get notified.
 */
export function resolveMentions(
  mentions: string[],
  users: MentionableUser[],
): MentionableUser[] {
  const lower = mentions.map((m) => m.toLowerCase());
  return users.filter((u) =>
    lower.includes(u.first_name.toLowerCase()),
  );
}

/** Insert one notification row per mentioned recipient. */
export async function createMentionNotifications(args: {
  note: string;
  users: MentionableUser[];
  senderId: string;
  companyId: string;
  activityId: string | null;
}) {
  const mentions = extractMentions(args.note);
  if (mentions.length === 0) return 0;
  const matched = resolveMentions(mentions, args.users).filter(
    (u) => u.id !== args.senderId,
  );
  if (matched.length === 0) return 0;
  const rows = matched.map((u) => ({
    recipient_id: u.id,
    sender_id: args.senderId,
    company_id: args.companyId,
    activity_id: args.activityId,
    message: args.note,
    is_read: false,
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    console.error("Notification insert failed", error);
    return 0;
  }
  return rows.length;
}

/** Load all active sælgere + admins for mention picking. */
export async function fetchMentionableUsers(
  excludeUserId?: string,
): Promise<MentionableUser[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");
  return (data ?? [])
    .filter((p) => p.id !== excludeUserId)
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      first_name: firstNameOf(p.full_name),
    }));
}
