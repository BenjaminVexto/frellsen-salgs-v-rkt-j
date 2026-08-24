import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  resolveEffectiveUserId,
  isTeamScopeUser,
  getSellerCompanyIds,
} from "./sales.server";

export type FaldendeKunde = {
  company_id: string;
  navn: string;
  by: string | null;
  klasse_primaer: string | null;
  aarsag_primaer: string | null;
  afvigelse_pct_primaer: number | null;
  base_kg_primaer: number | null;
  akt_kg_primaer: number | null;
  tabt_kg_pr_mdr: number | null;
  tabt_kr_pr_mdr: number | null;
  grupper_i_fald: number;
  assigned_to: string | null;
  sidste_koeb_primaer: string | null;
  forventet_interval_mdr: number | null;
};


export const getFaldendeKunder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input?: { viewAsUserId?: string | null; teamScope?: boolean; afdelingNr?: number | null }) =>
      input ?? {},
  )
  .handler(async ({ data, context }): Promise<{ customers: FaldendeKunde[]; hasData: boolean }> => {
    const effectiveUserId = await resolveEffectiveUserId(
      context.supabase,
      context.userId,
      data.viewAsUserId,
    );
    const teamScope =
      !!data.teamScope &&
      !data.viewAsUserId &&
      (await isTeamScopeUser(context.supabase, context.userId));

    const SELECT =
      "company_id, afdeling_nr, assigned_to, klasse_primaer, aarsag_primaer, afvigelse_pct_primaer, base_kg_primaer, akt_kg_primaer, sidste_koeb_primaer, tabt_kg_pr_mdr, tabt_kr_pr_mdr, grupper_i_fald, handling_paakraevet";

    let signalRows: any[] = [];
    if (teamScope) {
      let q = context.supabase
        .from("forbrug_signal_virksomhed" as any)
        .select(SELECT)
        .eq("handling_paakraevet", true);
      if (data.afdelingNr != null) q = q.eq("afdeling_nr", data.afdelingNr);
      const { data: rows, error } = await q;
      if (error) throw error;
      signalRows = rows ?? [];
    } else {
      const companyIds = await getSellerCompanyIds(
        context.supabase,
        effectiveUserId,
        data.afdelingNr ?? null,
      );
      if (!companyIds.length) return { customers: [], hasData: false };
      for (let i = 0; i < companyIds.length; i += 150) {
        const { data: rows, error } = await context.supabase
          .from("forbrug_signal_virksomhed" as any)
          .select(SELECT)
          .eq("handling_paakraevet", true)
          .in("company_id", companyIds.slice(i, i + 150));
        if (error) throw error;
        if (rows) signalRows.push(...rows);
      }
    }

    if (!signalRows.length) return { customers: [], hasData: true };

    // Afvisninger: en afvisning tæller kun hvis den er oprettet efter den
    // sidste købsmåned sluttede. "paused" respekterer snooze_until/snooze_user_id.
    const candIds = signalRows.map((r) => r.company_id as string);
    const dismissals: any[] = [];
    for (let i = 0; i < candIds.length; i += 150) {
      const { data: rows } = await context.supabase
        .from("churn_dismissals")
        .select("company_id, reason, snooze_user_id, snooze_until, created_at")
        .in("company_id", candIds.slice(i, i + 150));
      if (rows) dismissals.push(...rows);
    }

    const today = new Date().toISOString().slice(0, 10);
    const dismissedSet = new Set<string>();
    for (const row of signalRows) {
      const lastPeriod: string | null = row.sidste_koeb_primaer ?? null;
      let lastEndMs = 0;
      if (lastPeriod) {
        const end = new Date(String(lastPeriod).slice(0, 10) + "T00:00:00Z");
        end.setUTCDate(1);
        end.setUTCMonth(end.getUTCMonth() + 1);
        lastEndMs = end.getTime();
      }
      const relevant = dismissals.filter(
        (d: any) =>
          d.company_id === row.company_id && new Date(d.created_at).getTime() >= lastEndMs,
      );
      for (const d of relevant) {
        if (d.reason === "paused") {
          if (
            (teamScope || d.snooze_user_id === effectiveUserId) &&
            d.snooze_until &&
            d.snooze_until >= today
          ) {
            dismissedSet.add(row.company_id);
            break;
          }
        } else {
          dismissedSet.add(row.company_id);
          break;
        }
      }
    }

    const kept = signalRows.filter((r) => !dismissedSet.has(r.company_id));
    if (!kept.length) return { customers: [], hasData: true };

    const compMap = new Map<string, { name: string; city: string | null }>();
    for (let i = 0; i < kept.length; i += 150) {
      const { data: comps, error } = await context.supabase
        .from("companies")
        .select("id, name, city")
        .in(
          "id",
          kept.slice(i, i + 150).map((r) => r.company_id),
        );
      if (error) throw error;
      (comps ?? []).forEach((c: any) => compMap.set(c.id, { name: c.name, city: c.city ?? null }));
    }

    const customers: FaldendeKunde[] = kept
      .map((r) => ({
        company_id: r.company_id as string,
        navn: compMap.get(r.company_id)?.name ?? "",
        by: compMap.get(r.company_id)?.city ?? null,
        klasse_primaer: r.klasse_primaer ?? null,
        aarsag_primaer: r.aarsag_primaer ?? null,
        afvigelse_pct_primaer: r.afvigelse_pct_primaer != null ? Number(r.afvigelse_pct_primaer) : null,
        base_kg_primaer: r.base_kg_primaer != null ? Number(r.base_kg_primaer) : null,
        akt_kg_primaer: r.akt_kg_primaer != null ? Number(r.akt_kg_primaer) : null,
        tabt_kg_pr_mdr: r.tabt_kg_pr_mdr != null ? Number(r.tabt_kg_pr_mdr) : null,
        tabt_kr_pr_mdr: r.tabt_kr_pr_mdr != null ? Number(r.tabt_kr_pr_mdr) : null,
        grupper_i_fald: Number(r.grupper_i_fald) || 0,
        assigned_to: r.assigned_to ?? null,
      }))
      .sort((a, b) => (b.tabt_kr_pr_mdr ?? 0) - (a.tabt_kr_pr_mdr ?? 0));

    return { customers, hasData: true };
  });

export type ForbrugSignalGruppe = {
  product_group_1: string | null;
  gruppe_navn: string | null;
  er_primaer: boolean;
  klasse: string | null;
  aarsag: string | null;
  afvigelse_pct: number | null;
  base_kg_pr_mdr: number | null;
  akt_kg_pr_mdr: number | null;
  base_omsaetning: number | null;
  akt_omsaetning: number | null;
  tabt_kg_pr_mdr: number | null;
  tabt_kr_pr_mdr: number | null;
  ordre_aendring_pct: number | null;
  stk_aendring_pct: number | null;
  sidste_koeb: string | null;
  mdr_siden_sidste_koeb: number | null;
  forventet_interval_mdr: number | null;
  handling_paakraevet: boolean;
};

export type ForbrugSignalLokation = ForbrugSignalGruppe & { location_id: string | null };

export const getForbrugSignalForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ grupper: ForbrugSignalGruppe[]; lokationer: ForbrugSignalLokation[] }> => {
      const COLS =
        "niveau, location_id, product_group_1, klasse, aarsag, afvigelse_pct, base_kg_pr_mdr, akt_kg_pr_mdr, base_omsaetning, akt_omsaetning, tabt_kg_pr_mdr, tabt_kr_pr_mdr, ordre_aendring_pct, stk_aendring_pct, sidste_koeb, mdr_siden_sidste_koeb, forventet_interval_mdr, handling_paakraevet";

      const [{ data: rows, error }, { data: roles, error: roleErr }] = await Promise.all([
        context.supabase
          .from("forbrug_signal_seneste" as any)
          .select(COLS)
          .eq("company_id", data.companyId),
        context.supabase.from("produktgruppe_rolle" as any).select("product_group_1, navn, er_primaer"),
      ]);
      if (error) throw error;
      if (roleErr) throw roleErr;

      const roleMap = new Map<string, { navn: string | null; er_primaer: boolean }>();
      (roles ?? []).forEach((r: any) =>
        roleMap.set(String(r.product_group_1), { navn: r.navn ?? null, er_primaer: !!r.er_primaer }),
      );

      const num = (v: any) => (v != null ? Number(v) : null);
      const map = (r: any) => {
        const role = roleMap.get(String(r.product_group_1));
        return {
          product_group_1: r.product_group_1 ?? null,
          gruppe_navn: role?.navn ?? null,
          er_primaer: !!role?.er_primaer,
          klasse: r.klasse ?? null,
          aarsag: r.aarsag ?? null,
          afvigelse_pct: num(r.afvigelse_pct),
          base_kg_pr_mdr: num(r.base_kg_pr_mdr),
          akt_kg_pr_mdr: num(r.akt_kg_pr_mdr),
          base_omsaetning: num(r.base_omsaetning),
          akt_omsaetning: num(r.akt_omsaetning),
          tabt_kg_pr_mdr: num(r.tabt_kg_pr_mdr),
          tabt_kr_pr_mdr: num(r.tabt_kr_pr_mdr),
          ordre_aendring_pct: num(r.ordre_aendring_pct),
          stk_aendring_pct: num(r.stk_aendring_pct),
          sidste_koeb: r.sidste_koeb ?? null,
          mdr_siden_sidste_koeb: num(r.mdr_siden_sidste_koeb),
          forventet_interval_mdr: num(r.forventet_interval_mdr),
          handling_paakraevet: !!r.handling_paakraevet,
        };
      };

      const sortFn = (a: ForbrugSignalGruppe, b: ForbrugSignalGruppe) => {
        if (a.er_primaer !== b.er_primaer) return a.er_primaer ? -1 : 1;
        return (b.tabt_kr_pr_mdr ?? 0) - (a.tabt_kr_pr_mdr ?? 0);
      };

      const all = rows ?? [];
      const grupper = all
        .filter((r: any) => r.niveau === "virksomhed")
        .map(map)
        .sort(sortFn);
      const lokationer = all
        .filter((r: any) => r.niveau === "lokation")
        .map((r: any) => ({ ...map(r), location_id: r.location_id ?? null }))
        .sort(sortFn);

      return { grupper, lokationer };
    },
  );

export type ForbrugSignalKort = {
  company_id: string;
  klasse_primaer: string | null;
  afvigelse_pct_primaer: number | null;
  grupper_i_fald: number;
  handling_paakraevet: boolean;
  tabt_kr_pr_mdr: number | null;
};

/** Slår signalet op for en liste virksomheder (til tabeller/rangeringer). */
export const getForbrugSignalMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyIds: string[] }) => input)
  .handler(async ({ data, context }): Promise<ForbrugSignalKort[]> => {
    const ids = Array.from(new Set((data.companyIds ?? []).filter(Boolean)));
    if (!ids.length) return [];
    const out: ForbrugSignalKort[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data: rows, error } = await context.supabase
        .from("forbrug_signal_virksomhed" as any)
        .select(
          "company_id, klasse_primaer, afvigelse_pct_primaer, grupper_i_fald, handling_paakraevet, tabt_kr_pr_mdr",
        )
        .in("company_id", ids.slice(i, i + 150));
      if (error) throw error;
      (rows ?? []).forEach((r: any) =>
        out.push({
          company_id: r.company_id,
          klasse_primaer: r.klasse_primaer ?? null,
          afvigelse_pct_primaer: r.afvigelse_pct_primaer != null ? Number(r.afvigelse_pct_primaer) : null,
          grupper_i_fald: Number(r.grupper_i_fald) || 0,
          handling_paakraevet: !!r.handling_paakraevet,
          tabt_kr_pr_mdr: r.tabt_kr_pr_mdr != null ? Number(r.tabt_kr_pr_mdr) : null,
        }),
      );
    }
    return out;
  });
