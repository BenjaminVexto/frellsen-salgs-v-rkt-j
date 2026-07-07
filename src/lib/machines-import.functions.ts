import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MachineRow = z
  .object({
    ordrenr: z.string().nullable().optional(),
    varenr: z.string().nullable().optional(),
    beskrivelse: z.string().nullable().optional(),
    serienr: z.string().nullable().optional(),
    udlanstype: z.string().nullable().optional(),
    navn: z.string().nullable().optional(),
    fak_kundenr: z.string().nullable().optional(),
    lev_kundenr: z.string().nullable().optional(),
    adresselinje2: z.string().nullable().optional(),
    aendret_dato: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .passthrough();

// Strukturerede kolonner på machine_enrichment — alt andet havner i data jsonb.
// lev_kundenr/fak_kundenr/maskin_type bevares også i data jsonb (eksisterende UI
// læser data->>'lev_kundenr'), så vi lader dem dryppe igennem til extras.
const ENRICHMENT_COLUMN_FIELDS = new Set([
  "serienr",
  "taelleraflaesning",
  "binding_ophor",
  "beregnet_slutdato",
  "handlingsdato",
  "handlingsdato_raw",
  "kobt_dato",
  "lease_leje_dato",
  "aftale_type",
]);

const EnrichmentRow = z
  .object({
    serienr: z.string(),
    taelleraflaesning: z.string().nullable().optional(),
    binding_ophor: z.string().nullable().optional(),
    beregnet_slutdato: z.string().nullable().optional(),
    handlingsdato: z.string().nullable().optional(),
    handlingsdato_raw: z.string().nullable().optional(),
    // Ejerskabs-/klassifikationsfelter fra Wittenborg G2/G4.
    kobt_dato: z.string().nullable().optional(),
    lease_leje_dato: z.string().nullable().optional(),
    aftale_type: z.string().nullable().optional(),
    // Lokations- og maskintype-felter fra Wittenborg SN-listen.
    lev_kundenr: z.string().nullable().optional(),
    fak_kundenr: z.string().nullable().optional(),
    maskin_type: z.string().nullable().optional(),
    navn: z.string().nullable().optional(),
    adresselinje2: z.string().nullable().optional(),
    data: z.record(z.string(), z.any()).nullable().optional(),
  })
  .passthrough();



const t = (s: unknown): string => (s == null ? "" : String(s).trim());

// Defensiv dato-normalisering: håndterer YYYY-MM-DD og YYYY-DD-MM (Visma).
function normDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  let mo = parseInt(m[2], 10);
  let d = parseInt(m[3], 10);
  if (mo > 12 && d <= 12) [mo, d] = [d, mo];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---- Helpers til at fylde location_equipment_units fra maskinlisten ----
// Speglet fra equipment-import.functions.ts så Maskiner-importen kan stå alene.
function normalizeVismaNo(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (!s) return "";
  const stripped = s.replace(/^0+/, "");
  return stripped || "0";
}
function cleanG2(s: string | null | undefined): string {
  if (!s) return "";
  const m = s.match(/^\s*\d+\s*\[(.+)\]\s*$/);
  return m ? m[1].trim() : s;
}
const COFFEE_KEYWORDS = [
  "wittenborg", "rex-royal", "rex royal", "bonamat", "animo",
  "schaerer", "franke", "krea", "optivend", "optimed", "jura",
  "profitec", "egro", "mondo", "racilio", "bravilor",
];
const FILTER_KEYWORDS = ["brita", "purity", "filter", "bwt", "quell", "st komplet"];
const COOLING_KEYWORDS = ["køl", "køleskab", "vitrifrigo", "mælkekøler", "fridge", "kølesk"];
const MILK_KEYWORDS = ["mælk", "milk"];
const GRINDER_KEYWORDS = ["kværn"];
type Category = "coffee" | "filter" | "cooling" | "grinder" | "other";
function categorize(desc: string): Category {
  const s = (desc || "").toLowerCase();
  if (FILTER_KEYWORDS.some((k) => s.includes(k))) return "filter";
  if (COOLING_KEYWORDS.some((k) => s.includes(k))) return "cooling";
  if (MILK_KEYWORDS.some((k) => s.includes(k))) return "cooling";
  if (GRINDER_KEYWORDS.some((k) => s.includes(k))) return "grinder";
  if (COFFEE_KEYWORDS.some((k) => s.includes(k))) return "coffee";
  return "other";
}
const FREE_LOAN_TOKENS = ["u/b", "4 [udlån]", "udlån", "6 [midlertidigt", "8 [prøve"];
const LEASE_TOKENS = ["3 [leje / leasing]", "leje / leasing"];
function simplifyAgreement(s: string): string {
  const x = s.trim();
  const lower = x.toLowerCase();
  if (lower.includes("5 [leje u/b]")) return "Gratis udlån (Leje u/b)";
  if (lower.includes("3 [leje / leasing]")) return "Leje";
  if (lower.includes("4 [udlån]")) return "Udlån";
  if (lower.includes("6 [midlertidigt")) return "Midlertidigt udlån";
  if (lower.includes("8 [prøveopsætning]")) return "Prøveopsætning";
  if (lower.includes("7 [bytteservice]")) return "Bytteservice";
  return x;
}
const UNIT_FILTER_KEYWORDS = ["brita", "purity", "flowmeter", "iq meter", "filterkurv"];
function isFilterUnit(text: string): boolean {
  const s = (text || "").toLowerCase();
  return UNIT_FILTER_KEYWORDS.some((k) => s.includes(k));
}

// ---- Klassifikation af udstyrs-ejerskab ----
// Fire værdier matcher CHECK-constraint på location_equipment_units.udstyr_type.
type UdstyrType = "leje_ub" | "leje_binding" | "kunde_ejet" | "ukendt";

// Wittenborg-maskine: klassificér fra egen enrichment-række.
// Trin 1: lease_leje_dato → Frellsen-ejet → trin 4.
// Trin 2: kobt_dato → kunde_ejet.
// Trin 3: G4-fallback på aftale_type.
// Trin 4 (kun Frellsen-ejet): binding_ophor → leje_binding, ellers leje_ub.
function classifyWittenborg(r: {
  kobt_dato?: string | null;
  lease_leje_dato?: string | null;
  binding_ophor?: string | null;
  aftale_type?: string | null;
}): UdstyrType {
  const lease = normDate(r.lease_leje_dato);
  const kobt = normDate(r.kobt_dato);
  const binding = normDate(r.binding_ophor);

  let frellsenOwned: boolean | null = null;
  if (lease) frellsenOwned = true;
  else if (kobt) return "kunde_ejet";
  else {
    const at = (r.aftale_type ?? "").trim().toLowerCase();
    if (at.startsWith("1 [serviceaftale]") || at.startsWith("0")) return "kunde_ejet";
    if (at.startsWith("4 [lejeaftale]")) frellsenOwned = true;
    else return "ukendt";
  }
  if (!frellsenOwned) return "ukendt";
  return binding ? "leje_binding" : "leje_ub";
}

// Maskinliste-enhed (rental): altid Frellsen-ejet.
// udlanstype "3 [Leje / Leasing]" → leje_binding; alt andet (4/5/6/7/8) → leje_ub.
function classifyRental(udlanstype: string | null | undefined): UdstyrType {
  const u = (udlanstype ?? "").trim().toLowerCase();
  if (u.startsWith("3 ") || u.startsWith("3[") || u.includes("leje / leasing") || u.includes("leje/leasing")) {
    return "leje_binding";
  }
  return "leje_ub";
}

function buildSummary(coffee: number, filters: number, cooling: number, service: number): string {
  const parts: string[] = [];
  if (coffee > 0) parts.push(`${coffee} ${coffee === 1 ? "kaffemaskine" : "kaffemaskiner"}`);
  if (filters > 0) parts.push(`${filters} ${filters === 1 ? "filter" : "filtre"}`);
  if (cooling > 0) parts.push(`${cooling} ${cooling === 1 ? "køl" : "køl"}`);
  if (service > 0) parts.push(`${service} service (kundeejet)`);
  return parts.join(", ");
}
function computeSalesSignal(
  hasFreeLoan: boolean,
  serviceContracts: number,
  frellsenOwned: number,
  lastPurchaseDate: string | null,
): string | null {
  const today = new Date();
  const last = lastPurchaseDate ? new Date(lastPurchaseDate) : null;
  const daysSince = last ? Math.floor((today.getTime() - last.getTime()) / 86400000) : null;
  if (hasFreeLoan && (last === null || (daysSince !== null && daysSince > 365))) return "Gratis udlån — intet/gammelt køb";
  if (hasFreeLoan && daysSince !== null && daysSince > 180) return "Gratis udlån — lav aktivitet";
  if (hasFreeLoan && daysSince !== null && daysSince > 90) return "Gratis udlån — opfølgning";
  if (serviceContracts > 0 && frellsenOwned === 0) return "Serviceaftale — konverteringspotentiale";
  return null;
}

export const importMachines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        machineRows: z.array(MachineRow).max(200000).default([]),
        enrichmentRows: z.array(EnrichmentRow).max(200000).default([]),
        enrichmentRowsUdenSn: z.array(EnrichmentRow).max(200000).default([]),
        diagnostics: z
          .object({
            machinesFile: z.string().optional(),
            enrichmentFile: z.string().optional(),
            enrichmentUdenSnFile: z.string().optional(),
            machinesHeaderRow: z.number().optional(),
            enrichmentHeaderRow: z.number().optional(),
            enrichmentUdenSnHeaderRow: z.number().optional(),
            machinesMapped: z.array(z.string()).optional(),
            enrichmentMapped: z.array(z.string()).optional(),
            enrichmentUdenSnMapped: z.array(z.string()).optional(),
            machinesMissing: z.array(z.string()).optional(),
            enrichmentMissing: z.array(z.string()).optional(),
            enrichmentUdenSnMissing: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adm } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adm) throw new Error("Forbidden: kun administratorer");

    const diag = data.diagnostics ?? {};
    console.log("[machines-import] diagnostics:", JSON.stringify(diag));
    console.log(
      `[machines-import] machineRows=${data.machineRows.length} enrichmentRows=${data.enrichmentRows.length}`,
    );

    // ---- Gate: serienr og kundenr på Maskinlisten ----
    if (data.machineRows.length > 0) {
      const withSerienr = data.machineRows.filter((r) => t(r.serienr)).length;
      const withKundenr = data.machineRows.filter(
        (r) => t(r.lev_kundenr) || t(r.fak_kundenr),
      ).length;
      console.log(
        `[machines-import] maskinliste sanity: withSerienr=${withSerienr} withKundenr=${withKundenr}`,
      );
      if (withSerienr === 0) {
        throw new Error(
          "Maskinlisten: 0 rækker har serienr — tjek header-detection eller alias-mapping",
        );
      }
      if (withKundenr === 0) {
        throw new Error(
          "Maskinlisten: 0 rækker har lev/fak kundenr — tjek header-detection",
        );
      }
    }
    if (data.enrichmentRows.length > 0) {
      const withSerienr = data.enrichmentRows.filter((r) => t(r.serienr)).length;
      console.log(`[machines-import] wittenborg sanity: withSerienr=${withSerienr}`);
      if (withSerienr === 0) {
        throw new Error("Wittenborg SN: 0 rækker har serienr — tjek header-detection");
      }
    }
    if (data.enrichmentRowsUdenSn.length > 0) {
      const withSerienr = data.enrichmentRowsUdenSn.filter((r) => t(r.serienr)).length;
      console.log(`[machines-import] wittenborg UDEN SN sanity: withSerienr=${withSerienr}`);
      if (withSerienr === 0) {
        throw new Error("Wittenborg UDEN SN: 0 rækker har serienr — tjek header-detection");
      }
    }

    const importedAt = new Date().toISOString();
    console.log("[machines-import] STEP 1: bygger machineRows");

    const dupCounter = new Map<string, number>();
    const machineRows: any[] = [];
    for (const r of data.machineRows) {
      const ordrenr = t(r.ordrenr);
      const varenr = t(r.varenr);
      const beskrivelse = t(r.beskrivelse);
      const serienr = t(r.serienr);
      const udlanstype = t(r.udlanstype);
      if (!ordrenr && !varenr && !beskrivelse && !serienr && !udlanstype) continue;
      const hashInput = [ordrenr, varenr, beskrivelse, serienr, udlanstype].join("|");
      const hash = crypto.createHash("sha1").update(hashInput).digest("hex");
      const idx = dupCounter.get(hash) ?? 0;
      dupCounter.set(hash, idx + 1);
      machineRows.push({
        id: `${hash}-${idx}`,
        dup_index: idx,
        ordrenr: ordrenr || null,
        varenr: varenr || null,
        beskrivelse: beskrivelse || null,
        serienr: serienr || null,
        udlanstype: udlanstype || null,
        navn: t(r.navn) || null,
        fak_kundenr: t(r.fak_kundenr) || null,
        lev_kundenr: t(r.lev_kundenr) || null,
        adresselinje2: t(r.adresselinje2) || null,
        aendret_dato: normDate(r.aendret_dato),
        status: t(r.status) || null,
        record_status: "aktiv",
        last_seen_import: importedAt,
        udgaaet_dato: null,
      });
    }
    console.log(`[machines-import] STEP 2: machineRows=${machineRows.length}`);

    try {
      let machinesActiveBefore = 0;
      let enrichmentActiveBefore = 0;
      if (data.machineRows.length > 0) {
        const { count, error } = await supabaseAdmin
          .from("machines" as any)
          .select("id", { count: "exact", head: true })
          .eq("record_status", "aktiv");
        if (error) throw new Error("count machines aktiv: " + JSON.stringify(error));
        machinesActiveBefore = count ?? 0;
        console.log(`[machines-import] STEP 3a: machinesActiveBefore=${machinesActiveBefore}`);
      }
      if (data.enrichmentRows.length > 0) {
        const { count, error } = await supabaseAdmin
          .from("machine_enrichment" as any)
          .select("serienr", { count: "exact", head: true })
          .eq("record_status", "aktiv");
        if (error) throw new Error("count enrichment aktiv: " + JSON.stringify(error));
        enrichmentActiveBefore = count ?? 0;
        console.log(`[machines-import] STEP 3b: enrichmentActiveBefore=${enrichmentActiveBefore}`);
      }

      // Reaktivering-tælling sprang over (`.in()` med mange ids sprænger header-grænsen).
      // Slutresultat regnes af call-site som tabel-delta.
      let machinesReactivated = 0;

      const CHUNK = 1000;
      let machinesUpserted = 0;
      console.log(`[machines-import] STEP 5: machines upsert start (${machineRows.length} rows)`);
      for (let i = 0; i < machineRows.length; i += CHUNK) {
        const slice = machineRows.slice(i, i + CHUNK);
        const { error, status, statusText } = await supabaseAdmin
          .from("machines" as any)
          .upsert(slice, { onConflict: "id" });
        if (error) {
          const msg = `machines upsert chunk ${i}: ${error.message} (code=${(error as any).code}, details=${(error as any).details}, hint=${(error as any).hint}, http=${status} ${statusText})`;
          console.error("[machines-import]", msg, "førsterække:", JSON.stringify(slice[0]));
          throw new Error(msg);
        }
        machinesUpserted += slice.length;
      }
      console.log(`[machines-import] STEP 5 DONE: machinesUpserted=${machinesUpserted}`);

      let machinesMarkedUdgaaet = 0;
      if (data.machineRows.length > 0) {
        const { data: upd, error } = await supabaseAdmin
          .from("machines" as any)
          .update({ record_status: "udgaaet", udgaaet_dato: importedAt })
          .or(`last_seen_import.is.null,last_seen_import.lt.${importedAt}`)
          .neq("record_status", "udgaaet")
          .select("id");
        if (error) throw new Error("machines udgået-mark: " + JSON.stringify(error));
        machinesMarkedUdgaaet = upd?.length ?? 0;
        console.log(`[machines-import] STEP 6: machinesMarkedUdgaaet=${machinesMarkedUdgaaet}`);
      }

      // ============================================================
      // STEP 6b: Fyld location_equipment_units + lokations-aggregater.
      // Maskinlisten leverer 'rental'-enheder, Wittenborg leverer 'wittenborg'-
      // enheder (autoritativ kaffemaskine-kilde). Filterrækker hvis serienr
      // matcher en Wittenborg-maskine på samme lokation får serial_no=null —
      // maskinen bærer nummeret.
      // ============================================================
      let unitsLocationsUpdated = 0;
      let unitsRowsInserted = 0;
      let unitsUnmatched = 0;
      let wittenborgUnitsInserted = 0;
      let wittenborgUnmatched = 0;
      let wittenborgUdenSnUnitsInserted = 0;
      let wittenborgUdenSnUnmatched = 0;
      let machineSerialConflicts = 0;

      const needLocLookup =
        data.machineRows.length > 0 ||
        data.enrichmentRows.length > 0 ||
        data.enrichmentRowsUdenSn.length > 0;
      // Fælles lokationsopslag — bruges af både rental-aggregat og Wittenborg-pass.
      const locByNormDelivery = new Map<string, { id: string; company_id: string }>();
      const locsByCompany = new Map<string, { id: string; visma_delivery_no: string | null }[]>();
      const compByNormFak = new Map<string, { id: string; last_purchase_date: string | null }>();

      if (needLocLookup) {
        const PAGE = 1000;
        let from = 0;
        while (true) {
          const { data: rows, error } = await supabaseAdmin
            .from("locations")
            .select("id, company_id, visma_delivery_no")
            .range(from, from + PAGE - 1);
          if (error) throw new Error("locations select: " + error.message);
          if (!rows || rows.length === 0) break;
          for (const l of rows as any[]) {
            if (l.visma_delivery_no) {
              const kk = normalizeVismaNo(l.visma_delivery_no);
              if (kk && !locByNormDelivery.has(kk)) {
                locByNormDelivery.set(kk, { id: l.id, company_id: l.company_id });
              }
            }
            const arr = locsByCompany.get(l.company_id) ?? [];
            arr.push({ id: l.id, visma_delivery_no: l.visma_delivery_no });
            locsByCompany.set(l.company_id, arr);
          }
          if (rows.length < PAGE) break;
          from += PAGE;
        }
        from = 0;
        while (true) {
          const { data: rows, error } = await supabaseAdmin
            .from("companies")
            .select("id, visma_id, last_purchase_date")
            .range(from, from + PAGE - 1);
          if (error) throw new Error("companies select: " + error.message);
          if (!rows || rows.length === 0) break;
          for (const c of rows as any[]) {
            if (c.visma_id) {
              const kk = normalizeVismaNo(c.visma_id);
              if (kk && !compByNormFak.has(kk)) {
                compByNormFak.set(kk, { id: c.id, last_purchase_date: c.last_purchase_date });
              }
            }
          }
          if (rows.length < PAGE) break;
          from += PAGE;
        }
        console.log(
          `[machines-import] STEP 6b: locations=${locByNormDelivery.size} companies=${compByNormFak.size}`,
        );
      }

      // Helper: slå lokation op fra (fak, lev) — samme fallback-kæde som før.
      function resolveLocation(fak: string, lev: string): { id: string; company_id: string } | null {
        const company = compByNormFak.get(fak);
        let loc = locByNormDelivery.get(lev) ?? null;
        if (!loc && company) {
          const candidates = locsByCompany.get(company.id) ?? [];
          const hit = candidates.find(
            (l) => l.visma_delivery_no && normalizeVismaNo(l.visma_delivery_no) === fak,
          );
          if (hit) loc = { id: hit.id, company_id: company.id };
        }
        if (!loc && company) {
          const candidates = locsByCompany.get(company.id) ?? [];
          if (candidates.length === 1) loc = { id: candidates[0].id, company_id: company.id };
        }
        return loc;
      }

      // ---- Wittenborg-pass FØR STEP 6b: byg sæt af (loc_id, serienr) ----
      type WittenborgUnit = {
        location_id: string;
        machine_type: string | null;
        serial_no: string;
        sub_location: string | null;
        navn: string | null;
        udstyr_type: UdstyrType;
      };
      const wittenborgByLoc = new Map<string, Set<string>>();
      const wittenborgUnits: WittenborgUnit[] = [];
      const wittenborgLocIds = new Set<string>();
      const wittenborgTypeCounts: Record<UdstyrType, number> = {
        leje_ub: 0, leje_binding: 0, kunde_ejet: 0, ukendt: 0,
      };
      if (data.enrichmentRows.length > 0) {
        let withLev = 0;
        for (const r of data.enrichmentRows) {
          const serienr = t(r.serienr);
          if (!serienr) continue;
          const lev = normalizeVismaNo(r.lev_kundenr);
          const fak = normalizeVismaNo(r.fak_kundenr);
          if (lev) withLev++;
          if (!lev && !fak) { wittenborgUnmatched++; continue; }
          const loc = resolveLocation(fak, lev);
          if (!loc) { wittenborgUnmatched++; continue; }
          const set = wittenborgByLoc.get(loc.id) ?? new Set<string>();
          set.add(serienr);
          wittenborgByLoc.set(loc.id, set);
          wittenborgLocIds.add(loc.id);
          const udstyr_type = classifyWittenborg({
            kobt_dato: (r as any).kobt_dato,
            lease_leje_dato: (r as any).lease_leje_dato,
            binding_ophor: r.binding_ophor,
            aftale_type: (r as any).aftale_type,
          });
          wittenborgTypeCounts[udstyr_type]++;
          wittenborgUnits.push({
            location_id: loc.id,
            machine_type: cleanG2(t(r.maskin_type)) || null,
            serial_no: serienr,
            sub_location: t(r.adresselinje2) || null,
            navn: t(r.navn) || null,
            udstyr_type,
          });
        }
        console.log(
          `[machines-import] STEP 6b Wittenborg-pass: rows=${data.enrichmentRows.length} withLev=${withLev} resolved=${wittenborgUnits.length} unmatched=${wittenborgUnmatched} locs=${wittenborgLocIds.size} types=${JSON.stringify(wittenborgTypeCounts)}`,
        );
      }

      // ---- Wittenborg UDEN SN-pass: samme logik, separat enheds-array + source-tag ----
      const wittenborgUdenSnUnits: WittenborgUnit[] = [];
      const wittenborgUdenSnLocIds = new Set<string>();
      const wittenborgUdenSnTypeCounts: Record<UdstyrType, number> = {
        leje_ub: 0, leje_binding: 0, kunde_ejet: 0, ukendt: 0,
      };
      if (data.enrichmentRowsUdenSn.length > 0) {
        let withLev = 0;
        for (const r of data.enrichmentRowsUdenSn) {
          const serienr = t(r.serienr);
          if (!serienr) continue;
          const lev = normalizeVismaNo(r.lev_kundenr);
          const fak = normalizeVismaNo(r.fak_kundenr);
          if (lev) withLev++;
          if (!lev && !fak) { wittenborgUdenSnUnmatched++; continue; }
          const loc = resolveLocation(fak, lev);
          if (!loc) { wittenborgUdenSnUnmatched++; continue; }
          // TILFØJ til samme wittenborgByLoc så Maskinliste-matching ser begge kilder.
          const set = wittenborgByLoc.get(loc.id) ?? new Set<string>();
          set.add(serienr);
          wittenborgByLoc.set(loc.id, set);
          wittenborgUdenSnLocIds.add(loc.id);
          const udstyr_type = classifyWittenborg({
            kobt_dato: (r as any).kobt_dato,
            lease_leje_dato: (r as any).lease_leje_dato,
            binding_ophor: r.binding_ophor,
            aftale_type: (r as any).aftale_type,
          });
          wittenborgUdenSnTypeCounts[udstyr_type]++;
          wittenborgUdenSnUnits.push({
            location_id: loc.id,
            machine_type: cleanG2(t(r.maskin_type)) || null,
            serial_no: serienr,
            sub_location: t(r.adresselinje2) || null,
            navn: t(r.navn) || null,
            udstyr_type,
          });
        }
        console.log(
          `[machines-import] STEP 6b Wittenborg UDEN SN-pass: rows=${data.enrichmentRowsUdenSn.length} withLev=${withLev} resolved=${wittenborgUdenSnUnits.length} unmatched=${wittenborgUdenSnUnmatched} locs=${wittenborgUdenSnLocIds.size} types=${JSON.stringify(wittenborgUdenSnTypeCounts)}`,
        );
      }


      if (data.machineRows.length > 0) {
        type UnitAgg = {
          coffee: number; filters: number; cooling: number; total: number;
          freeLoan: boolean; lease: boolean;
          agreementSet: Set<string>;
          units: {
            source: "rental";
            is_filter: boolean;
            machine_type: string | null;
            serial_no: string | null;
            sub_location: string | null;
            agreement_type: string | null;
            is_free_loan: boolean;
            has_service_contract: boolean;
            varenr: string | null;
            udstyr_type: UdstyrType;
          }[];

        };
        const aggs = new Map<string, UnitAgg>(); // key: `${fak}||${lev}`
        const ensure = (): UnitAgg => ({
          coffee: 0, filters: 0, cooling: 0, total: 0,
          freeLoan: false, lease: false,
          agreementSet: new Set<string>(), units: [],
        });

        for (const r of data.machineRows) {
          const fak = normalizeVismaNo(r.fak_kundenr);
          const lev = normalizeVismaNo(r.lev_kundenr);
          if (!lev) continue;
          const k = `${fak}||${lev}`;
          let a = aggs.get(k);
          if (!a) { a = ensure(); aggs.set(k, a); }
          const desc = (r.beskrivelse ?? "").toString();
          const cat = categorize(desc);
          if (cat === "coffee") a.coffee++;
          else if (cat === "filter") a.filters++;
          else if (cat === "cooling") a.cooling++;
          a.total++;
          const ut = (r.udlanstype ?? "").toString().toLowerCase();
          const isFree = FREE_LOAN_TOKENS.some((tok) => ut.includes(tok));
          // has_free_loan-flaget skal kun afspejle ikke-filter leje_ub-maskiner
          // (filtre alene udløser ikke salgssignalet "Gratis udlån").
          if (isFree && !isFilterUnit(desc) && classifyRental(r.udlanstype) === "leje_ub") {
            a.freeLoan = true;
          }
          if (LEASE_TOKENS.some((tok) => ut.includes(tok))) a.lease = true;
          const agreementShort =
            r.udlanstype && String(r.udlanstype).trim()
              ? simplifyAgreement(String(r.udlanstype))
              : null;
          if (agreementShort) a.agreementSet.add(agreementShort);
          a.units.push({
            source: "rental",
            is_filter: isFilterUnit(desc),
            machine_type: desc.trim() || null,
            serial_no: (r.serienr ?? "").toString().trim() || null,
            sub_location: (r.adresselinje2 ?? "").toString().trim() || null,
            agreement_type: agreementShort,
            is_free_loan: isFree,
            has_service_contract: false,
            varenr: (r.varenr ?? "").toString().trim() || null,
            udstyr_type: classifyRental(r.udlanstype),
          });
        }

        console.log(`[machines-import] STEP 6b: aggs=${aggs.size}`);

        type LocUpdate = { id: string; payload: Record<string, any>; units: UnitAgg["units"] };
        const updates: LocUpdate[] = [];
        const usedLocationIds = new Set<string>();

        for (const [key, a] of aggs.entries()) {
          const [fak, lev] = key.split("||");
          const company = compByNormFak.get(fak);
          const loc = resolveLocation(fak, lev);
          if (!loc) { unitsUnmatched++; continue; }
          if (usedLocationIds.has(loc.id)) continue;
          usedLocationIds.add(loc.id);

          // Markér filterrækker hvis serienr matcher Wittenborg-maskine på samme lokation.
          // Maskinen bærer serienummeret; filteret står som tilbehør uden synligt serienr.
          // Tæl konflikter: ikke-filter maskinrækker hvor serienr ikke matcher Wittenborg.
          const witSet = wittenborgByLoc.get(loc.id);
          // Gruppér a.units efter serial_no FØR matching, så vi kan se om en gruppe
          // har 1 række (ren dublet) eller flere (maskine + tilbehør).
          const bySerial = new Map<string, typeof a.units>();
          for (const u of a.units) {
            if (!u.serial_no) continue;
            const list = bySerial.get(u.serial_no) ?? [];
            list.push(u);
            bySerial.set(u.serial_no, list);
          }
          const skipUnits = new Set<typeof a.units[number]>();
          for (const u of a.units) {
            if (!u.serial_no) continue;
            const matchesWit = !!witSet && witSet.has(u.serial_no);
            const group = bySerial.get(u.serial_no) ?? [];
            const isSoleRow = group.length === 1;

            if (u.is_filter && matchesWit) {
              u.serial_no = null;
            } else if (!u.is_filter && matchesWit && categorize(u.machine_type ?? "") !== "coffee") {
              // Tilbehør (køl/mælk/grinder) der deler serienr med Wittenborg-maskine:
              // fold ind som filtrene, vis ikke som selvstændigt kort.
              u.is_filter = true;
              u.serial_no = null;
            } else if (!u.is_filter && matchesWit && isSoleRow) {
              // Ren dublet: Wittenborg-enheden dækker denne — skip.
              skipUnits.add(u);
            } else if (!u.is_filter && matchesWit) {
              u.serial_no = null;
            } else if (!u.is_filter && !matchesWit) {
              machineSerialConflicts++;
            }
          }
          if (skipUnits.size > 0) {
            a.units = a.units.filter((u) => !skipUnits.has(u));
          }

          const agreementTypes = a.agreementSet.size > 0 ? Array.from(a.agreementSet).join(", ") : null;
          const summary = buildSummary(a.coffee, a.filters, a.cooling, 0);
          const lpd = company?.last_purchase_date ?? null;
          const signal = computeSalesSignal(a.freeLoan, 0, a.total, lpd);
          updates.push({
            id: loc.id,
            payload: {
              equipment_frellsen_owned: a.total,
              equipment_coffee_machines: a.coffee,
              equipment_filters: a.filters,
              equipment_cooling: a.cooling,
              has_lease_agreement: a.lease,
              has_free_loan: a.freeLoan,
              agreement_types: agreementTypes,
              equipment_summary: summary,
              sales_signal: signal,
              equipment_updated_at: new Date().toISOString(),
            },
            units: a.units,
          });
        }

        // Bulk update — gruppér efter identisk payload
        if (updates.length) {
          const stable = (o: any): string => JSON.stringify(o, Object.keys(o).sort());
          const groups = new Map<string, { payload: any; ids: string[] }>();
          for (const u of updates) {
            const kk = stable(u.payload);
            const g = groups.get(kk);
            if (g) g.ids.push(u.id);
            else groups.set(kk, { payload: u.payload, ids: [u.id] });
          }
          const CHUNK_U = 300;
          for (const { payload, ids } of groups.values()) {
            for (let i = 0; i < ids.length; i += CHUNK_U) {
              const slice = ids.slice(i, i + CHUNK_U);
              const { error } = await supabaseAdmin.from("locations").update(payload).in("id", slice);
              if (error) console.error("[machines-import] locations update fejl:", error.message);
            }
          }
          unitsLocationsUpdated = updates.length;
        }

        // Idempotent: slet rental-units på berørte lokationer og indsæt på ny.
        // Service- og wittenborg-units røres ikke her.
        const affected = Array.from(usedLocationIds);
        if (affected.length) {
          const CHUNK_D = 300;
          for (let i = 0; i < affected.length; i += CHUNK_D) {
            const slice = affected.slice(i, i + CHUNK_D);
            const { error } = await supabaseAdmin
              .from("location_equipment_units")
              .delete()
              .eq("source", "rental")
              .in("location_id", slice);
            if (error) console.error("[machines-import] units delete fejl:", error.message);
          }
        }
        const batchId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? (crypto as any).randomUUID()
            : null;
        const unitRows: Record<string, any>[] = [];
        for (const u of updates) {
          for (const unit of u.units) {
            unitRows.push({ ...unit, location_id: u.id, import_batch_id: batchId });
          }
        }
        if (unitRows.length) {
          const CHUNK_I = 500;
          for (let i = 0; i < unitRows.length; i += CHUNK_I) {
            const slice = unitRows.slice(i, i + CHUNK_I);
            const { error } = await supabaseAdmin
              .from("location_equipment_units")
              .insert(slice as any);
            if (error) console.error("[machines-import] units insert fejl:", error.message);
            else unitsRowsInserted += slice.length;
          }
        }
        console.log(
          `[machines-import] STEP 6b DONE: locUpdated=${unitsLocationsUpdated} unitsInserted=${unitsRowsInserted} unmatched=${unitsUnmatched} serialConflicts=${machineSerialConflicts}`,
        );
      }

      // ---- STEP 6c: Indsæt source='wittenborg' units (idempotent pr. lokation) ----
      if (wittenborgUnits.length > 0) {
        const witLocs = Array.from(wittenborgLocIds);
        const CHUNK_D = 300;
        for (let i = 0; i < witLocs.length; i += CHUNK_D) {
          const slice = witLocs.slice(i, i + CHUNK_D);
          const { error } = await supabaseAdmin
            .from("location_equipment_units")
            .delete()
            .eq("source", "wittenborg")
            .in("location_id", slice);
          if (error) console.error("[machines-import] wittenborg delete fejl:", error.message);
        }
        const witBatchId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? (crypto as any).randomUUID()
            : null;
        // Dedup pr. (location_id, serienr) — re-import må ikke duplikere.
        const seenKey = new Set<string>();
        const witRows: Record<string, any>[] = [];
        for (const w of wittenborgUnits) {
          const k = `${w.location_id}||${w.serial_no}`;
          if (seenKey.has(k)) continue;
          seenKey.add(k);
          witRows.push({
            source: "wittenborg",
            location_id: w.location_id,
            is_filter: false,
            machine_type: w.machine_type,
            serial_no: w.serial_no,
            sub_location: w.sub_location,
            agreement_type: null,
            is_free_loan: false,
            has_service_contract: false,
            varenr: null,
            udstyr_type: w.udstyr_type,
            import_batch_id: witBatchId,
          });
        }

        const CHUNK_I = 500;
        for (let i = 0; i < witRows.length; i += CHUNK_I) {
          const slice = witRows.slice(i, i + CHUNK_I);
          const { error } = await supabaseAdmin
            .from("location_equipment_units")
            .insert(slice as any);
          if (error) console.error("[machines-import] wittenborg insert fejl:", error.message);
          else wittenborgUnitsInserted += slice.length;
        }
        console.log(
          `[machines-import] STEP 6c DONE: wittenborgInserted=${wittenborgUnitsInserted} (uniqueRows=${witRows.length}) onLocs=${witLocs.length} unmatched=${wittenborgUnmatched}`,
        );
      }

      // ---- STEP 6d: Indsæt source='wittenborg_uden_sn' units (idempotent pr. lokation) ----
      if (wittenborgUdenSnUnits.length > 0) {
        const witLocs = Array.from(wittenborgUdenSnLocIds);
        const CHUNK_D = 300;
        for (let i = 0; i < witLocs.length; i += CHUNK_D) {
          const slice = witLocs.slice(i, i + CHUNK_D);
          const { error } = await supabaseAdmin
            .from("location_equipment_units")
            .delete()
            .eq("source", "wittenborg_uden_sn")
            .in("location_id", slice);
          if (error) console.error("[machines-import] wittenborg_uden_sn delete fejl:", error.message);
        }
        const witBatchId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? (crypto as any).randomUUID()
            : null;
        const seenKey = new Set<string>();
        const witRows: Record<string, any>[] = [];
        for (const w of wittenborgUdenSnUnits) {
          const k = `${w.location_id}||${w.serial_no}`;
          if (seenKey.has(k)) continue;
          seenKey.add(k);
          witRows.push({
            source: "wittenborg_uden_sn",
            location_id: w.location_id,
            is_filter: false,
            machine_type: w.machine_type,
            serial_no: w.serial_no,
            sub_location: w.sub_location,
            agreement_type: null,
            is_free_loan: false,
            has_service_contract: false,
            varenr: null,
            udstyr_type: w.udstyr_type,
            import_batch_id: witBatchId,
          });
        }
        const CHUNK_I = 500;
        for (let i = 0; i < witRows.length; i += CHUNK_I) {
          const slice = witRows.slice(i, i + CHUNK_I);
          const { error } = await supabaseAdmin
            .from("location_equipment_units")
            .insert(slice as any);
          if (error) console.error("[machines-import] wittenborg_uden_sn insert fejl:", error.message);
          else wittenborgUdenSnUnitsInserted += slice.length;
        }
        console.log(
          `[machines-import] STEP 6d DONE: wittenborgUdenSnInserted=${wittenborgUdenSnUnitsInserted} (uniqueRows=${witRows.length}) onLocs=${witLocs.length} unmatched=${wittenborgUdenSnUnmatched}`,
        );
      }




      const enrMap = new Map<string, any>();
      for (const r of data.enrichmentRows) {
        const serienr = t(r.serienr);
        if (!serienr) continue;
        const extras: Record<string, any> = { ...(r.data && typeof r.data === "object" ? r.data : {}) };
        for (const [k, v] of Object.entries(r as Record<string, any>)) {
          if (ENRICHMENT_COLUMN_FIELDS.has(k) || k === "data") continue;
          if (v == null || v === "") continue;
          extras[k] = v;
        }
        enrMap.set(serienr, {
          serienr,
          taelleraflaesning: normDate(r.taelleraflaesning),
          binding_ophor: normDate(r.binding_ophor),
          beregnet_slutdato: normDate(r.beregnet_slutdato),
          handlingsdato: normDate(r.handlingsdato),
          handlingsdato_raw: r.handlingsdato_raw || null,
          kobt_dato: normDate((r as any).kobt_dato),
          lease_leje_dato: normDate((r as any).lease_leje_dato),
          aftale_type: t((r as any).aftale_type) || null,
          data: Object.keys(extras).length > 0 ? extras : null,
          record_status: "aktiv",
          last_seen_import: importedAt,

          udgaaet_dato: null,
        });
      }
      const enrRows = Array.from(enrMap.values());
      console.log(`[machines-import] STEP 7: enrRows=${enrRows.length}`);

      // Reaktivering-tælling sprang over (header-grænse).
      let enrichmentReactivated = 0;

      const { count: enrCountBefore } = await supabaseAdmin
        .from("machine_enrichment" as any)
        .select("serienr", { count: "exact", head: true });
      console.log(`[machines-import] STEP 9: enr count FØR=${enrCountBefore ?? 0}`);

      let enrichmentUpserted = 0;
      for (let i = 0; i < enrRows.length; i += CHUNK) {
        const slice = enrRows.slice(i, i + CHUNK);
        const { error, status, statusText } = await supabaseAdmin
          .from("machine_enrichment" as any)
          .upsert(slice, { onConflict: "serienr" });
        if (error) {
          const msg = `enrichment upsert chunk ${i}: ${error.message} (code=${(error as any).code}, details=${(error as any).details}, hint=${(error as any).hint}, http=${status} ${statusText})`;
          console.error("[machines-import]", msg, "førsterække:", JSON.stringify(slice[0]));
          throw new Error(msg);
        }
        enrichmentUpserted += slice.length;
      }
      console.log(`[machines-import] STEP 10 DONE: enrichmentUpserted=${enrichmentUpserted}`);

      const { count: enrCountAfter } = await supabaseAdmin
        .from("machine_enrichment" as any)
        .select("serienr", { count: "exact", head: true });
      console.log(`[machines-import] STEP 11: enr count EFTER=${enrCountAfter ?? 0}`);

      let enrichmentMarkedUdgaaet = 0;
      if (data.enrichmentRows.length > 0) {
        const { data: upd, error } = await supabaseAdmin
          .from("machine_enrichment" as any)
          .update({ record_status: "udgaaet", udgaaet_dato: importedAt })
          .or(`last_seen_import.is.null,last_seen_import.lt.${importedAt}`)
          .neq("record_status", "udgaaet")
          .select("serienr");
        if (error) throw new Error("enrichment udgået-mark: " + JSON.stringify(error));
        enrichmentMarkedUdgaaet = upd?.length ?? 0;
      }

      console.log(`[machines-import] FÆRDIG: machines=${machinesUpserted} enrichment=${enrichmentUpserted}`);
      return {
        machinesUpserted,
        enrichmentUpserted,
        machineRowsParsed: data.machineRows.length,
        enrichmentRowsParsed: data.enrichmentRows.length,
        machinesActiveBefore,
        enrichmentActiveBefore,
        machinesMarkedUdgaaet,
        enrichmentMarkedUdgaaet,
        machinesReactivated,
        enrichmentReactivated,
        unitsLocationsUpdated,
        unitsRowsInserted,
        unitsUnmatched,
        wittenborgUnitsInserted,
        wittenborgUnmatched,
        machineSerialConflicts,
        wittenborgTypeCounts,
        wittenborgUdenSnUnitsInserted,
        wittenborgUdenSnUnmatched,
        importedAt,

      };
    } catch (e: any) {
      console.error("[machines-import] TOP-LEVEL FEJL:", e?.message ?? String(e), "\nSTACK:", e?.stack ?? "(ingen)");
      throw e;
    }
  });
