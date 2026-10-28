import { createServerFn } from "@tanstack/react-start";
import { kraevIntern } from "@/lib/kraev-intern";
import { komprimerJson } from "@/lib/komprimer-json";
import { STANDARD_SATSER, SATS_NOEGLER, TAELLER_PREFIX, type Satser } from "@/lib/udstyr";

/** Grundlag (aggregeret pr. lokation + maskiner). Sælgere får altid kun egne lokationer (håndhævet i SQL). */
export const hentUdstyr = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((d: { sellerId?: string | null; alle?: boolean; fra: string; til: string; companyId?: string | null }) => d)
  .handler(async ({ data, context }): Promise<string> => {
    const { data: res, error } = await (context.supabase as any).rpc("udstyr_grundlag", {
      _saelger: data.sellerId ?? context.userId,
      _alle: !!data.alle,
      _fra: data.fra,
      _til: data.til,
      _company: data.companyId ?? null,
    });
    if (error) throw new Error("Kunne ikke hente udstyr: " + error.message);
    return komprimerJson(res);
  });

export const hentUdstyrSatser = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .handler(async ({ context }): Promise<Satser> => {
    const { data } = await (context.supabase as any).from("udstyr_indstilling").select("noegle, vaerdi");
    const m = new Map<string, number>((data ?? []).map((r: any) => [r.noegle, Number(r.vaerdi)]));
    const ud: Satser = { ...STANDARD_SATSER, taellerPrType: {} };
    for (const [n, v] of m) if (n.startsWith(TAELLER_PREFIX) && v > 0) ud.taellerPrType[n.slice(TAELLER_PREFIX.length)] = v;
    for (const k of Object.keys(SATS_NOEGLER) as (keyof typeof SATS_NOEGLER)[]) {
      const v = m.get(SATS_NOEGLER[k]);
      if (v != null && Number.isFinite(v)) ud[k] = v;
    }
    return ud;
  });

export const gemUdstyrSatser = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((d: Satser) => d)
  .handler(async ({ data, context }) => {
    const nu = new Date().toISOString();
    const rows = (Object.keys(SATS_NOEGLER) as (keyof typeof SATS_NOEGLER)[]).map((k) => {
      const v = Number(data[k]);
      if (!Number.isFinite(v) || v < 0) throw new Error("Ugyldig værdi");
      return { noegle: SATS_NOEGLER[k], vaerdi: v, opdateret_at: nu };
    });
    // Tællergrænse pr. maskintype; 0 = bruges ikke.
    for (const [t, raw] of Object.entries(data.taellerPrType ?? {})) {
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) throw new Error("Ugyldig tællergrænse");
      rows.push({ noegle: TAELLER_PREFIX + t, vaerdi: v, opdateret_at: nu });
    }
    const { error } = await (context.supabase as any).from("udstyr_indstilling").upsert(rows);
    if (error) throw new Error("Kun admin kan ændre satserne");
    return { ok: true };
  });

export const hentUdstyrLinjer = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((d: { lev: string; fra: string; til: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("udstyr_linjer", { _lev: data.lev, _fra: data.fra, _til: data.til });
    if (error) throw new Error("Kun admin");
    return (rows ?? []) as { period: string; varenr: string; varetekst: string; varegruppe: string; antal: number; beloeb: number; kostpris: number; db: number }[];
  });

export const hentLejeUdenBonusklasse = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .handler(async ({ context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("udstyr_leje_uden_bonusklasse");
    if (error) throw new Error("Kun admin");
    return (rows ?? []) as { varenr: string; varetekst: string; maskintype: string; beloeb_12m: number }[];
  });

/**
 * Må brugeren se DB? Samme kilde som resten af DB-visningerne: DB-funktionen
 * maa_se_db (admin eller profiles.maa_se_db). Kun admin må spørge om en anden
 * bruger end sig selv — fx den, man ser som.
 */
export const hentMaaSeDb = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((d: { userId?: string | null }) => d)
  .handler(async ({ data, context }): Promise<boolean> => {
    let malet = context.userId;
    if (data.userId && data.userId !== context.userId) {
      const { data: adminRow } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!adminRow) throw new Error("Ikke adgang");
      malet = data.userId;
    }
    const { data: seDb } = await (context.supabase as any).rpc("maa_se_db", { _user_id: malet });
    return seDb === true;
  });
