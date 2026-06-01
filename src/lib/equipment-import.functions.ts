import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: kun administratorer");
}

// ---- Normalisering af Visma-numre ----
// xlsx kan give numbers; DB gemmer text. Trim whitespace og strip leading zeros
// så "001810100", " 1810100 ", 1810100 alle bliver "1810100".
function normalizeVismaNo(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (!s) return "";
  const stripped = s.replace(/^0+/, "");
  return stripped || "0";
}

// ---- Kategorisering ----
const COFFEE_KEYWORDS = [
  "wittenborg", "rex-royal", "rex royal", "bonamat", "animo",
  "schaerer", "franke", "krea", "optivend", "optimed", "jura",
  "profitec", "egro", "mondo", "racilio", "bravilor",
];
const FILTER_KEYWORDS = ["brita", "purity", "filter", "bwt", "quell", "st komplet"];
const COOLING_KEYWORDS = ["køl", "vitrifrigo", "mælkekøler", "fridge", "kølesk"];
const GRINDER_KEYWORDS = ["kværn"];

type Category = "coffee" | "filter" | "cooling" | "grinder" | "other";
function categorize(desc: string): Category {
  const s = (desc || "").toLowerCase();
  if (COFFEE_KEYWORDS.some((k) => s.includes(k))) return "coffee";
  if (FILTER_KEYWORDS.some((k) => s.includes(k))) return "filter";
  if (COOLING_KEYWORDS.some((k) => s.includes(k))) return "cooling";
  if (GRINDER_KEYWORDS.some((k) => s.includes(k))) return "grinder";
  return "other";
}

const FREE_LOAN_TOKENS = ["u/b", "4 [udlån]", "udlån", "6 [midlertidigt", "8 [prøve"];
const LEASE_TOKENS = ["3 [leje / leasing]", "leje / leasing"];

function simplifyAgreement(s: string): string {
  const t = s.trim();
  const lower = t.toLowerCase();
  if (lower.includes("5 [leje u/b]")) return "Gratis udlån (Leje u/b)";
  if (lower.includes("3 [leje / leasing]")) return "Leje";
  if (lower.includes("4 [udlån]")) return "Udlån";
  if (lower.includes("6 [midlertidigt")) return "Midlertidigt udlån";
  if (lower.includes("8 [prøveopsætning]")) return "Prøveopsætning";
  if (lower.includes("7 [bytteservice]")) return "Bytteservice";
  return t;
}

// Rydder Visma's "N [tekst]"-format på maskintype-felter (Maskin type G2 i serviceudtræk).
// Tallet foran er en Visma-gruppeindex og må ALDRIG vises som del af maskintypen.
// "6 [9100 R&G]" -> "Wittenborg 9100 R&G"
function cleanMachineType(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const m = t.match(/^\d+\s*\[(.+)\]\s*$/);
  if (m) {
    const inner = m[1].trim();
    return /^wittenborg\b/i.test(inner) ? inner : `Wittenborg ${inner}`;
  }
  return t;
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

  if (hasFreeLoan && (last === null || (daysSince !== null && daysSince > 365))) {
    return "Gratis udlån — intet/gammelt køb";
  }
  if (hasFreeLoan && daysSince !== null && daysSince > 180) {
    return "Gratis udlån — lav aktivitet";
  }
  if (hasFreeLoan && daysSince !== null && daysSince > 90) {
    return "Gratis udlån — opfølgning";
  }
  if (serviceContracts > 0 && frellsenOwned === 0) {
    return "Serviceaftale — konverteringspotentiale";
  }
  return null;
}

// ---- Input shapes (rå rækker fra klient) ----
const RentalRow = z.object({
  fak: z.union([z.string(), z.number()]).optional().default(""),
  lev: z.union([z.string(), z.number()]).optional().default(""),
  beskrivelse: z.string().optional().default(""),
  udlanstype: z.string().optional().default(""),
  varenr: z.string().optional().default(""),
  serienr: z.string().optional().default(""),
  adresselinje2: z.string().optional().default(""),
});
const ServiceRow = z.object({
  fak: z.union([z.string(), z.number()]).optional().default(""),
  lev: z.union([z.string(), z.number()]).optional().default(""),
  maskintype: z.string().optional().default(""),
  serienr: z.string().optional().default(""),
  aftaletype: z.string().optional().default(""),
  status: z.string().optional().default(""),
  placering: z.string().optional().default(""),
});

// Unit-level filter klassifikation (uafhængig af gamle FILTER_KEYWORDS)
const UNIT_FILTER_KEYWORDS = ["brita", "purity", "flowmeter", "iq meter", "filterkurv"];
function isFilterUnit(text: string): boolean {
  const s = (text || "").toLowerCase();
  return UNIT_FILTER_KEYWORDS.some((k) => s.includes(k));
}

type UnitRow = {
  source: "rental" | "service";
  is_filter: boolean;
  machine_type: string | null;
  serial_no: string | null;
  sub_location: string | null;
  agreement_type: string | null;
  is_free_loan: boolean;
  has_service_contract: boolean;
  varenr: string | null;
};

type LocAgg = {
  fak: string; // normaliseret
  lev: string; // normaliseret
  coffee: number;
  filters: number;
  cooling: number;
  total: number; // frellsen_owned
  service: number;
  freeLoan: boolean;
  lease: boolean;
  agreementSet: Set<string>;
  units: UnitRow[];
};

export const processEquipmentImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rentalRows: z.array(RentalRow).max(100000).default([]),
        serviceRows: z.array(ServiceRow).max(100000).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    const aggs = new Map<string, LocAgg>(); // key: `${fak}||${lev}` (normaliseret)
    const ensure = (fak: string, lev: string): LocAgg => {
      const k = `${fak}||${lev}`;
      const existing = aggs.get(k);
      if (existing) return existing;
      const created: LocAgg = {
        fak, lev,
        coffee: 0, filters: 0, cooling: 0, total: 0, service: 0,
        freeLoan: false, lease: false,
        agreementSet: new Set<string>(),
        units: [],
      };
      aggs.set(k, created);
      return created;
    };

    // --- Fil A ---
    for (const r of data.rentalRows) {
      const fak = normalizeVismaNo(r.fak);
      const lev = normalizeVismaNo(r.lev);
      if (!lev) continue;
      const a = ensure(fak, lev);
      const desc = r.beskrivelse || "";
      const cat = categorize(desc);
      if (cat === "coffee") a.coffee++;
      else if (cat === "filter") a.filters++;
      else if (cat === "cooling") a.cooling++;
      a.total++;
      const ut = (r.udlanstype || "").toLowerCase();
      const isFree = FREE_LOAN_TOKENS.some((t) => ut.includes(t));
      if (isFree) a.freeLoan = true;
      if (LEASE_TOKENS.some((t) => ut.includes(t))) a.lease = true;
      const agreementShort = r.udlanstype && r.udlanstype.trim() ? simplifyAgreement(r.udlanstype) : null;
      if (agreementShort) a.agreementSet.add(agreementShort);
      a.units.push({
        source: "rental",
        is_filter: isFilterUnit(desc),
        machine_type: desc.trim() || null,
        serial_no: r.serienr?.trim() || null,
        sub_location: r.adresselinje2?.trim() || null,
        agreement_type: agreementShort,
        is_free_loan: isFree,
        has_service_contract: false,
        varenr: r.varenr?.trim() || null,
      });
    }

    // --- Fil B ---
    for (const r of data.serviceRows) {
      const fak = normalizeVismaNo(r.fak);
      const lev = normalizeVismaNo(r.lev);
      if (!lev) continue;
      const a = ensure(fak, lev);
      a.service++;
      const mt = r.maskintype || "";
      a.units.push({
        source: "service",
        is_filter: isFilterUnit(mt),
        machine_type: mt.trim() || null,
        serial_no: r.serienr?.trim() || null,
        sub_location: r.placering?.trim() || null,
        agreement_type: r.aftaletype?.trim() || null,
        is_free_loan: false,
        has_service_contract: true,
        varenr: null,
      });
    }


    if (aggs.size === 0) {
      return { updated: 0, fallbackUpdated: 0, created: 0, unmatched: 0 };
    }

    // --- Hent ALLE locations + companies så vi kan matche med normalisering ---
    // (Datasættet er ikke større end at vi nemt kan holde det i memory.)
    const locByNormDelivery = new Map<string, { id: string; company_id: string }>();
    const locsByCompany = new Map<string, { id: string; visma_delivery_no: string | null }[]>();
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: rows, error } = await supabaseAdmin
          .from("locations")
          .select("id, company_id, visma_delivery_no")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        if (!rows || rows.length === 0) break;
        for (const l of rows as any[]) {
          if (l.visma_delivery_no) {
            const k = normalizeVismaNo(l.visma_delivery_no);
            if (k && !locByNormDelivery.has(k)) {
              locByNormDelivery.set(k, { id: l.id, company_id: l.company_id });
            }
          }
          const arr = locsByCompany.get(l.company_id) ?? [];
          arr.push({ id: l.id, visma_delivery_no: l.visma_delivery_no });
          locsByCompany.set(l.company_id, arr);
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }

    // companies: visma_id (Fak. kundenr) -> {id, last_purchase_date}
    const compByNormFak = new Map<string, { id: string; last_purchase_date: string | null }>();
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: rows, error } = await supabaseAdmin
          .from("companies")
          .select("id, visma_id, last_purchase_date")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        if (!rows || rows.length === 0) break;
        for (const c of rows as any[]) {
          if (c.visma_id) {
            const k = normalizeVismaNo(c.visma_id);
            if (k && !compByNormFak.has(k)) {
              compByNormFak.set(k, { id: c.id, last_purchase_date: c.last_purchase_date });
            }
          }
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }

    let exactUpdated = 0;
    let fallbackUpdated = 0;
    let created = 0;
    let unmatched = 0;

    type LocUpdate = { id: string; companyId: string; payload: Record<string, any>; units: UnitRow[] };
    type LocInsert = { payload: Record<string, any>; units: UnitRow[] };
    const updates: LocUpdate[] = [];
    const inserts: LocInsert[] = [];
    // Track så samme lokation ikke opdateres dobbelt (Fil A + Fil B aggregeres allerede,
    // men fallbacks kan tilfældigvis pege på samme lokation fra forskellige aggs).
    const usedLocationIds = new Set<string>();

    for (const a of aggs.values()) {
      const company = compByNormFak.get(a.fak);

      // Prøv exact match på delivery_no
      let loc = locByNormDelivery.get(a.lev);
      let matchKind: "exact" | "fallback" | "none" = loc ? "exact" : "none";

      // Fallback A: company-match + lokation hvor delivery_no = fak (primær lokation)
      if (!loc && company) {
        const candidates = locsByCompany.get(company.id) ?? [];
        const hit = candidates.find(
          (l) => l.visma_delivery_no && normalizeVismaNo(l.visma_delivery_no) === a.fak,
        );
        if (hit) {
          loc = { id: hit.id, company_id: company.id };
          matchKind = "fallback";
        }
      }
      // Fallback B: virksomheden har præcis én lokation
      if (!loc && company) {
        const candidates = locsByCompany.get(company.id) ?? [];
        if (candidates.length === 1) {
          loc = { id: candidates[0].id, company_id: company.id };
          matchKind = "fallback";
        }
      }

      // Sikrer vi ikke skriver til samme lokation to gange via fallbacks
      if (loc && usedLocationIds.has(loc.id)) {
        // Spring over yderligere agg der mapper til samme lokation; den allerede
        // tilføjede update får ikke aggregeret videre — accepteret tradeoff.
        loc = undefined as any;
        matchKind = "none";
      }

      if (!loc && !company) {
        unmatched++;
        continue;
      }

      const agreementTypes = a.agreementSet.size > 0 ? Array.from(a.agreementSet).join(", ") : null;
      const summary = buildSummary(a.coffee, a.filters, a.cooling, a.service);
      const lpd = company?.last_purchase_date ?? null;
      const signal = computeSalesSignal(a.freeLoan, a.service, a.total, lpd);

      const payload: Record<string, any> = {
        equipment_frellsen_owned: a.total,
        equipment_coffee_machines: a.coffee,
        equipment_filters: a.filters,
        equipment_cooling: a.cooling,
        equipment_service_contracts: a.service,
        has_lease_agreement: a.lease,
        has_free_loan: a.freeLoan,
        agreement_types: agreementTypes,
        equipment_summary: summary,
        sales_signal: signal,
        equipment_updated_at: new Date().toISOString(),
      };

      if (loc) {
        usedLocationIds.add(loc.id);
        updates.push({ id: loc.id, companyId: loc.company_id, payload, units: a.units });
        if (matchKind === "exact") exactUpdated++;
        else fallbackUpdated++;
      } else if (company) {
        // Fallback C: opret ny lokation
        inserts.push({
          payload: {
            ...payload,
            company_id: company.id,
            visma_delivery_no: a.lev,
            is_primary: false,
          },
          units: a.units,
        });
      }
    }

    // ---- Snapshot af lokationer FØR opdatering, til rollback ----
    const SNAPSHOT_FIELDS = [
      "equipment_frellsen_owned",
      "equipment_coffee_machines",
      "equipment_filters",
      "equipment_cooling",
      "equipment_service_contracts",
      "has_lease_agreement",
      "has_free_loan",
      "agreement_types",
      "equipment_summary",
      "sales_signal",
      "equipment_updated_at",
    ];
    const affectedLocIds = Array.from(usedLocationIds);
    const snapshot: { id: string; before: Record<string, any> }[] = [];
    if (affectedLocIds.length) {
      const CHUNK = 300;
      for (let i = 0; i < affectedLocIds.length; i += CHUNK) {
        const slice = affectedLocIds.slice(i, i + CHUNK);
        const { data: rows, error } = await supabaseAdmin
          .from("locations")
          .select(`id, ${SNAPSHOT_FIELDS.join(", ")}`)
          .in("id", slice);
        if (error) throw new Error(error.message);
        (rows ?? []).forEach((r: any) => {
          const { id, ...before } = r;
          snapshot.push({ id, before });
        });
      }
    }

    // Bulk update — gruppér efter identisk payload
    if (updates.length) {
      const stable = (o: any): string => JSON.stringify(o, Object.keys(o).sort());
      const groups = new Map<string, { payload: any; ids: string[] }>();
      for (const u of updates) {
        const k = stable(u.payload);
        const g = groups.get(k);
        if (g) g.ids.push(u.id);
        else groups.set(k, { payload: u.payload, ids: [u.id] });
      }
      const CHUNK = 300;
      for (const { payload, ids } of groups.values()) {
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const { error } = await supabaseAdmin.from("locations").update(payload).in("id", slice);
          if (error) {
            console.error("Equipment update fejl:", error.message);
          }
        }
      }
    }

    // Inserts (nye lokationer) — behold mapping fra payload til units
    const createdIds: string[] = [];
    const createdUnitsByLocId = new Map<string, UnitRow[]>();
    if (inserts.length) {
      const CHUNK = 300;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const sliceInserts = inserts.slice(i, i + CHUNK);
        const slice = sliceInserts.map((x) => x.payload);
        const { data: res, error } = await supabaseAdmin
          .from("locations")
          .insert(slice as any)
          .select("id");
        if (error) {
          console.error("Equipment insert fejl:", error.message);
          continue;
        }
        const ids = (res ?? []).map((r: any) => r.id);
        ids.forEach((id: string, idx: number) => {
          createdUnitsByLocId.set(id, sliceInserts[idx].units);
        });
        createdIds.push(...ids);
        created += ids.length;
      }
    }

    // ---- Idempotent erstatning af enheds-rækker pr. berørt lokation ----
    const batchId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : null;
    const allAffectedLocIds = [...affectedLocIds, ...createdIds];
    if (allAffectedLocIds.length) {
      const CHUNK_DEL = 300;
      for (let i = 0; i < allAffectedLocIds.length; i += CHUNK_DEL) {
        const slice = allAffectedLocIds.slice(i, i + CHUNK_DEL);
        const { error } = await supabaseAdmin
          .from("location_equipment_units")
          .delete()
          .in("location_id", slice);
        if (error) console.error("Equipment units delete fejl:", error.message);
      }
    }

    // Saml unit-rækker fra updates + nye lokationer
    const unitRows: Record<string, any>[] = [];
    for (const u of updates) {
      for (const unit of u.units) {
        unitRows.push({ ...unit, location_id: u.id, import_batch_id: batchId });
      }
    }
    for (const [locId, units] of createdUnitsByLocId.entries()) {
      for (const unit of units) {
        unitRows.push({ ...unit, location_id: locId, import_batch_id: batchId });
      }
    }
    if (unitRows.length) {
      const CHUNK_INS = 500;
      for (let i = 0; i < unitRows.length; i += CHUNK_INS) {
        const slice = unitRows.slice(i, i + CHUNK_INS);
        const { error } = await supabaseAdmin
          .from("location_equipment_units")
          .insert(slice as any);
        if (error) console.error("Equipment units insert fejl:", error.message);
      }
    }


    // Registrér batch i importhistorik (til rollback)
    const totalAffected = snapshot.length + createdIds.length;
    if (totalAffected > 0) {
      await supabaseAdmin.from("import_batches").insert({
        kind: "maskindata",
        filename: `Maskindata-import (${data.rentalRows.length} leje/udlån + ${data.serviceRows.length} service)`,
        created_by: context.userId,
        company_count: 0,
        item_count: totalAffected,
        payload: {
          snapshot,
          created_location_ids: createdIds,
        } as any,
      });
    }

    return {
      updated: exactUpdated,
      fallbackUpdated,
      created,
      unmatched,
    };
  });

// Nulstil ALLE equipment-felter på alle lokationer
export const resetEquipmentData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    // Slet alle enheds-rækker først
    {
      const { error } = await supabaseAdmin
        .from("location_equipment_units")
        .delete()
        .not("id", "is", null);
      if (error) console.error("Equipment units reset fejl:", error.message);
    }
    const { error, count } = await supabaseAdmin
      .from("locations")
      .update(
        {
          equipment_frellsen_owned: 0,
          equipment_coffee_machines: 0,
          equipment_filters: 0,
          equipment_cooling: 0,
          equipment_service_contracts: 0,
          has_lease_agreement: false,
          has_free_loan: false,
          agreement_types: null,
          equipment_summary: null,
          sales_signal: null,
          equipment_updated_at: null,
        },
        { count: "exact" },
      )
      .not("id", "is", null);
    if (error) throw new Error(error.message);
    return { reset: count ?? 0 };
  });
