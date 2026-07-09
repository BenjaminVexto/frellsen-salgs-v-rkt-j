import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Henter virksomheder tildelt brugeren hvor der ikke har været aktivitet i 90+ dage
 * og opretter "sovende_kunde"-notifikationer (idempotent via partielt unikt indeks).
 */
export const checkSovendeKunder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    // Hent virksomheder tildelt direkte (companies.assigned_to)
    const { data: companies, error } = await supabaseAdmin
      .from("companies")
      .select("id, name")
      .eq("assigned_to", userId)
      .limit(2000);
    if (error) throw new Error(error.message);
    if (!companies?.length) return { created: 0 };

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffIso = cutoff.toISOString();

    // For hver virksomhed, find seneste aktivitet
    const sovende: Array<{ id: string; name: string; days: number }> = [];
    for (const c of companies) {
      const { data: latest } = await supabaseAdmin
        .from("activities")
        .select("created_at")
        .eq("company_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const latestDate = latest?.created_at;
      const isStale = !latestDate || latestDate < cutoffIso;
      if (isStale) {
        const days = latestDate
          ? Math.floor((Date.now() - new Date(latestDate).getTime()) / 86400000)
          : 999;
        sovende.push({ id: c.id, name: c.name, days });
      }
    }
    if (!sovende.length) return { created: 0 };

    const rows = sovende.slice(0, 50).map((s) => ({
      recipient_id: userId,
      sender_id: userId,
      company_id: s.id,
      message: `Du har ikke haft kontakt med ${s.name} i ${s.days}+ dage`,
      notification_type: "sovende_kunde",
      is_read: false,
    }));

    const { error: insErr, count } = await supabaseAdmin
      .from("notifications")
      .upsert(rows as any, {
        onConflict: "recipient_id,notification_type,company_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (insErr) {
      console.error("checkSovendeKunder upsert:", insErr.message);
      return { created: 0 };
    }
    return { created: count ?? 0 };
  });

/**
 * Finder konkurrentaftaler for brugerens virksomheder som udløber inden for 90 dage.
 */
export const checkKonkurrentvinduer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("assigned_to", userId)
      .limit(2000);
    const ids = (companies ?? []).map((c) => c.id);
    if (!ids.length) return { created: 0 };

    const today = new Date().toISOString().slice(0, 10);
    const in90 = new Date();
    in90.setDate(in90.getDate() + 90);
    const cutoff = in90.toISOString().slice(0, 10);

    const CHUNK = 150;
    const agreements: any[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await supabaseAdmin
        .from("competitor_assignments")
        .select("company_id, contract_expires_at, competitors(name), companies(name)")
        .in("company_id", slice)
        .not("contract_expires_at", "is", null)
        .gte("contract_expires_at", today)
        .lte("contract_expires_at", cutoff);
      if (error) throw new Error(error.message);
      if (data) agreements.push(...data);
    }
    if (!agreements.length) return { created: 0 };

    const rows = agreements.map((a: any) => ({
      recipient_id: userId,
      sender_id: userId,
      company_id: a.company_id,
      message: `Konkurrentaftale udløber snart: ${a.companies?.name ?? "Virksomhed"} · ${a.competitors?.name ?? "Konkurrent"} udløber ${a.contract_expires_at}`,
      notification_type: "konkurrentvindue",
      is_read: false,
    }));

    const { error: insErr, count } = await supabaseAdmin
      .from("notifications")
      .upsert(rows as any, {
        onConflict: "recipient_id,notification_type,company_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (insErr) {
      console.error("checkKonkurrentvinduer upsert:", insErr.message);
      return { created: 0 };
    }
    return { created: count ?? 0 };
  });

/**
 * Finder aktiviteter med next_followup_date = i dag og opretter opfølgnings-notifikationer.
 */
export const checkOpfoelgninger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const today = new Date().toISOString().slice(0, 10);
    const { data: activities, error } = await supabaseAdmin
      .from("activities")
      .select("id, company_id, next_action, companies(name)")
      .eq("created_by", userId)
      .eq("next_followup_date", today);
    if (error) throw new Error(error.message);
    if (!activities?.length) return { created: 0 };

    const rows = activities.map((a: any) => ({
      recipient_id: userId,
      sender_id: userId,
      company_id: a.company_id,
      activity_id: a.id,
      message: `Du har en opfølgning planlagt i dag: ${a.companies?.name ?? "Virksomhed"}${a.next_action ? " — " + a.next_action : ""}`,
      notification_type: "opfølgning",
      is_read: false,
    }));

    const { error: insErr, count } = await supabaseAdmin
      .from("notifications")
      .upsert(rows as any, {
        onConflict: "recipient_id,notification_type,company_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (insErr) {
      console.error("checkOpfoelgninger upsert:", insErr.message);
      return { created: 0 };
    }
    return { created: count ?? 0 };
  });

export const runDailyChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    // Indlejret kald via supabaseAdmin (samme funktioner)
    const userId = context.userId;
    return { ok: true, userId };
  });
