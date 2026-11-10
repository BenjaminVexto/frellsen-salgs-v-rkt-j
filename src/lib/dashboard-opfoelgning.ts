export type Opfoelgning = {
  id: string;
  next_followup_date: string | null;
  next_action_note: string | null;
  assigned_to?: string | null;
  company: { id: string; name: string; city: string | null } | null;
};
export type OpkaldEjer = { company_id: string; contact_list_id: string; user_id: string; rolle: string; udfald: string };

export function egneListeOpfoelgninger<T extends Opfoelgning & { contact_list_id: string; company_id: string; status: string }>(rows: T[], logs: OpkaldEjer[], userId: string): T[] {
  const latest = new Map<string, OpkaldEjer>();
  // Input er nyeste først; noter må ikke overtage ejerskabet til et udfald.
  for (const log of logs) {
    const key = `${log.contact_list_id}:${log.company_id}`;
    if (log.udfald !== "note" && !latest.has(key)) latest.set(key, log);
  }
  return rows.filter((row) => {
    if (row.assigned_to !== userId || !["ny", "skal_kontaktes", "forsoegt", "ring_igen", "senere_emne", "tilbud_oensket", "tilbud_sendt"].includes(row.status)) return false;
    const log = latest.get(`${row.contact_list_id}:${row.company_id}`);
    return !log || (log.rolle !== "telemarketing" && log.user_id === userId);
  });
}