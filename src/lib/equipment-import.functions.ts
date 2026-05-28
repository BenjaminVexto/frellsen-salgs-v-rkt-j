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
  fak: z.string(),
  lev: z.string(),
  beskrivelse: z.string().optional().default(""),
  udlanstype: z.string().optional().default(""),
  varenr: z.string().optional().default(""),
  serienr: z.string().optional().default(""),
});
const ServiceRow = z.object({
  fak: z.string(),
  lev: z.string(),
  maskintype: z.string().optional().default(""),
  serienr: z.string().optional().default(""),
  aftaletype: z.string().optional().default(""),
  status: z.string().optional().default(""),
});

type LocAgg = {
  fak: string;
  lev: string;
  coffee: number;
  filters: number;
  cooling: number;
  total: number; // frellsen_owned
  service: number;
  freeLoan: boolean;
  lease: boolean;
  agreementSet: Set<string>;
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

    const aggs = new Map<string, LocAgg>(); // key: `${fak}||${lev}`
    const ensure = (fak: string, lev: string): LocAgg => {
      const k = `${fak}||${lev}`;
      let a = aggs.get(k);
      if (!a) {
        a = {
          fak,
          lev,
          coffee: 0,
          filters: 0,
          cooling: 0,
          total: 0,
          service: 0,
          freeLoan: false,
          lease: false,
          agreementSet: new Set<string>(),
        };
        aggs.set(k, a);
      }
      return a;
    };

    // --- Fil A ---
    for (const r of data.rentalRows) {
      const fak = String(r.fak ?? "").trim();
      const lev = String(r.lev ?? "").trim();
      if (!lev) continue;
      const a = ensure(fak, lev);
      const cat = categorize(r.beskrivelse || "");
      if (cat === "coffee") a.coffee++;
      else if (cat === "filter") a.filters++;
      else if (cat === "cooling") a.cooling++;
      a.total++;
      const ut = (r.udlanstype || "").toLowerCase();
      if (FREE_LOAN_TOKENS.some((t) => ut.includes(t))) a.freeLoan = true;
      if (LEASE_TOKENS.some((t) => ut.includes(t))) a.lease = true;
      if (r.udlanstype && r.udlanstype.trim()) {
        a.agreementSet.add(simplifyAgreement(r.udlanstype));
      }
    }

    // --- Fil B ---
    for (const r of data.serviceRows) {
      const fak = String(r.fak ?? "").trim();
      const lev = String(r.lev ?? "").trim();
      if (!lev) continue;
      const a = ensure(fak, lev);
      a.service++;
    }

    if (aggs.size === 0) {
      return { updated: 0, created: 0, unmatched: 0 };
    }

    // --- Hent eksisterende locations og companies ---
    const allLevs = Array.from(new Set(Array.from(aggs.values()).map((a) => a.lev))).filter(Boolean);
    const allFaks = Array.from(new Set(Array.from(aggs.values()).map((a) => a.fak))).filter(Boolean);

    // locations: lev -> {id, company_id}
    const locByLev = new Map<string, { id: string; company_id: string }>();
    {
      const CHUNK = 300;
      for (let i = 0; i < allLevs.length; i += CHUNK) {
        const slice = allLevs.slice(i, i + CHUNK);
        const { data: locs, error } = await supabaseAdmin
          .from("locations")
          .select("id, company_id, visma_delivery_no")
          .in("visma_delivery_no", slice);
        if (error) throw new Error(error.message);
        (locs ?? []).forEach((l: any) => {
          if (l.visma_delivery_no) locByLev.set(String(l.visma_delivery_no), { id: l.id, company_id: l.company_id });
        });
      }
    }

    // companies by visma_id (fak) -> id (+ last_purchase_date + visma_delivery_id)
    const compByFak = new Map<string, { id: string; last_purchase_date: string | null; visma_delivery_id: string | null }>();
    {
      const CHUNK = 300;
      for (let i = 0; i < allFaks.length; i += CHUNK) {
        const slice = allFaks.slice(i, i + CHUNK);
        const { data: cs, error } = await supabaseAdmin
          .from("companies")
          .select("id, visma_id, last_purchase_date, visma_delivery_id")
          .in("visma_id", slice);
        if (error) throw new Error(error.message);
        (cs ?? []).forEach((c: any) => {
          if (c.visma_id) compByFak.set(String(c.visma_id), {
            id: c.id,
            last_purchase_date: c.last_purchase_date,
            visma_delivery_id: c.visma_delivery_id,
          });
        });
      }
    }

    let updated = 0;
    let created = 0;
    let unmatched = 0;

    // Saml updates + inserts
    type LocUpdate = { id: string; payload: Record<string, any> };
    type LocInsert = { company_id: string; visma_delivery_no: string; payload: Record<string, any> };
    const updates: LocUpdate[] = [];
    const inserts: LocInsert[] = [];

    for (const a of aggs.values()) {
      const company = compByFak.get(a.fak);
      let loc = locByLev.get(a.lev);

      // Hvis ingen lokation findes — kræver vi en company-match for at oprette
      if (!loc && !company) {
        unmatched++;
        continue;
      }

      const agreementTypes = a.agreementSet.size > 0 ? Array.from(a.agreementSet).join(", ") : null;
      const summary = buildSummary(a.coffee, a.filters, a.cooling, a.service);
      const lastPurchase = (loc
        ? null // we'll fetch via separate map below if needed
        : company?.last_purchase_date) ?? company?.last_purchase_date ?? null;
      const signal = computeSalesSignal(a.freeLoan, a.service, a.total, lastPurchase);

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
        updates.push({ id: loc.id, payload });
      } else if (company) {
        inserts.push({
          company_id: company.id,
          visma_delivery_no: a.lev,
          payload: {
            ...payload,
            company_id: company.id,
            visma_delivery_no: a.lev,
            is_primary: false,
          },
        });
      }
    }

    // For at få korrekt last_purchase_date på eksisterende locations skal vi
    // hente company.last_purchase_date for hvert update — gør det via companies-map
    // ved at slå op på loc.company_id.
    if (updates.length) {
      const companyIds = Array.from(new Set(updates.map((u) => locByLev_findCompanyId(locByLev, u.id)).filter((x): x is string => !!x)));
      const lpdByCompany = new Map<string, string | null>();
      const CHUNK = 300;
      for (let i = 0; i < companyIds.length; i += CHUNK) {
        const slice = companyIds.slice(i, i + CHUNK);
        const { data: cs } = await supabaseAdmin
          .from("companies")
          .select("id, last_purchase_date")
          .in("id", slice);
        (cs ?? []).forEach((c: any) => lpdByCompany.set(c.id, c.last_purchase_date));
      }
      // Genberegn sales_signal per update
      for (const u of updates) {
        const companyId = locByLev_findCompanyId(locByLev, u.id);
        const lpd = companyId ? lpdByCompany.get(companyId) ?? null : null;
        u.payload.sales_signal = computeSalesSignal(
          !!u.payload.has_free_loan,
          Number(u.payload.equipment_service_contracts || 0),
          Number(u.payload.equipment_frellsen_owned || 0),
          lpd,
        );
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
            continue;
          }
          updated += slice.length;
        }
      }
    }

    // Inserts
    if (inserts.length) {
      const CHUNK = 300;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const slice = inserts.slice(i, i + CHUNK).map((x) => x.payload);
        const { data: res, error } = await supabaseAdmin
          .from("locations")
          .insert(slice as any)
          .select("id");
        if (error) {
          console.error("Equipment insert fejl:", error.message);
          continue;
        }
        created += (res ?? []).length;
      }
    }

    return { updated, created, unmatched };
  });

function locByLev_findCompanyId(
  locByLev: Map<string, { id: string; company_id: string }>,
  locationId: string,
): string | null {
  for (const v of locByLev.values()) {
    if (v.id === locationId) return v.company_id;
  }
  return null;
}
