import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Adressesøgning og koncernopslag mod CVR (Erhvervsstyrelsens
 * Elasticsearch-distribution, cvr-permanent) + vores egen cvr_penheder-tabel.
 */
const ES = "http://distribution.virk.dk/cvr-permanent";

async function es(index: "virksomhed" | "produktionsenhed", payload: unknown): Promise<any> {
  const user = process.env.CVR_USERNAME;
  const pass = process.env.CVR_PASSWORD;
  if (!user || !pass) throw new Error("CVR-adgang mangler");
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const res = await fetch(`${ES}/${index}/_search`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`CVR-fejl ${res.status}`);
  return res.json();
}

function fmtAdr(a: any): { address: string | null; zip: string | null; city: string | null } {
  if (!a) return { address: null, zip: null, city: null };
  const vej = a.vejnavn ?? "";
  const nr = a.husnummerFra != null ? String(a.husnummerFra) : "";
  const bogst = a.bogstavFra ?? "";
  const etage = a.etage ? `, ${a.etage}.` : "";
  return {
    address: vej ? `${vej} ${nr}${bogst}${etage}`.trim() : null,
    zip: a.postnummer != null ? String(a.postnummer) : null,
    city: a.postdistrikt ?? null,
  };
}

function interval(meta: any): string | null {
  const k =
    meta?.nyesteErstMaanedsbeskaeftigelse?.intervalKodeAntalAnsatte ??
    meta?.nyesteKvartalsbeskaeftigelse?.intervalKodeAntalAnsatte ??
    meta?.nyesteAarsbeskaeftigelse?.intervalKodeAntalAnsatte ??
    null;
  return k ? String(k).replace(/^ANTAL_/, "").replace("_", "–") : null;
}

export type CrmKonto = {
  id: string;
  name: string;
  city: string | null;
  afdeling_nr: number | null;
  locations: { id: string; address: string | null; zip: string | null; city: string | null }[];
};

export type AdresseHit = {
  p_number: string;
  name: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  ansatte: string | null;
  kilde: "cvr" | "lokal" | "begge";
  cvr: string | null;
  hoved: { name: string | null; address: string | null; zip: string | null; city: string | null } | null;
  crm: CrmKonto[];
  /** Lokation i CRM, som P-nummeret allerede er koblet til. */
  linkedLocation: { id: string; company_id: string; company_name: string; address: string | null; city: string | null } | null;
};

/** "Vesterbrogade 12B" → { vej: "Vesterbrogade", nr: 12 } */
export function parseAdresse(s: string): { vej: string; nr: number | null } {
  const m = s.trim().match(/^(.*?)\s+(\d+)\s*[a-zA-ZæøåÆØÅ]?\s*(,.*)?$/);
  if (m) return { vej: m[1].trim(), nr: parseInt(m[2], 10) };
  return { vej: s.trim(), nr: null };
}

async function crmForCvrs(supabase: any, cvrs: string[]) {
  const byCvr = new Map<string, CrmKonto[]>();
  if (!cvrs.length) return byCvr;
  const { data: comps } = await supabase
    .from("companies")
    .select("id, name, city, cvr, afdeling_nr")
    .in("cvr", cvrs)
    .is("afloest_af_company_id", null)
    .limit(500);
  const ids = (comps ?? []).map((c: any) => c.id);
  const locsBy = new Map<string, CrmKonto["locations"]>();
  if (ids.length) {
    const { data: locs } = await supabase
      .from("locations")
      .select("id, company_id, address, zip, city")
      .in("company_id", ids)
      .limit(2000);
    for (const l of locs ?? []) {
      const a = locsBy.get(l.company_id) ?? [];
      a.push({ id: l.id, address: l.address, zip: l.zip, city: l.city });
      locsBy.set(l.company_id, a);
    }
  }
  for (const c of comps ?? []) {
    const a = byCvr.get(c.cvr) ?? [];
    a.push({ id: c.id, name: c.name, city: c.city, afdeling_nr: c.afdeling_nr, locations: locsBy.get(c.id) ?? [] });
    byCvr.set(c.cvr, a);
  }
  return byCvr;
}

export const cvrAdresseSoeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        adresse: z.string().trim().max(100).default(""),
        postnr: z.string().trim().regex(/^\d{4}$/).optional().or(z.literal("")),
      })
      .refine((v) => v.adresse.length >= 2 || !!v.postnr, "Angiv adresse og/eller postnr.")
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { vej, nr } = parseAdresse(data.adresse);
    const postnr = data.postnr || null;
    const hits = new Map<string, AdresseHit>();
    let cvrFejl: string | null = null;

    // 1) Live CVR-opslag på P-enheder (aktive)
    try {
      const must: any[] = [{ match: { "VrproduktionsEnhed.produktionsEnhedMetadata.sammensatStatus": "Aktiv" } }];
      if (vej) must.push({ match: { "VrproduktionsEnhed.produktionsEnhedMetadata.nyesteBeliggenhedsadresse.vejnavn": { query: vej, operator: "and" } } });
      if (nr != null) must.push({ term: { "VrproduktionsEnhed.produktionsEnhedMetadata.nyesteBeliggenhedsadresse.husnummerFra": nr } });
      if (postnr) must.push({ term: { "VrproduktionsEnhed.produktionsEnhedMetadata.nyesteBeliggenhedsadresse.postnummer": parseInt(postnr, 10) } });
      const json = await es("produktionsenhed", {
        _source: ["VrproduktionsEnhed.pNummer", "VrproduktionsEnhed.produktionsEnhedMetadata"],
        query: { bool: { must } },
        size: 30,
      });
      for (const h of json?.hits?.hits ?? []) {
        const p = h?._source?.VrproduktionsEnhed;
        if (!p?.pNummer) continue;
        const meta = p.produktionsEnhedMetadata ?? {};
        const a = fmtAdr(meta.nyesteBeliggenhedsadresse);
        hits.set(String(p.pNummer), {
          p_number: String(p.pNummer),
          name: meta.nyesteNavn?.navn ?? null,
          ...a,
          ansatte: interval(meta),
          kilde: "cvr",
          cvr: meta.nyesteCvrNummerRelation != null ? String(meta.nyesteCvrNummerRelation).padStart(8, "0") : null,
          hoved: null,
          crm: [],
          linkedLocation: null,
        });
      }
    } catch (e: any) {
      cvrFejl = e?.message ?? "CVR-opslag fejlede";
    }

    // 2) Vores egen kopi (cvr_penheder)
    let q = context.supabase
      .from("cvr_penheder")
      .select("p_number, cvr, name, address, zip, city, ansatte_interval, is_active")
      .limit(30);
    if (vej) q = q.ilike("address", `${vej.replace(/[%_]/g, "")}${nr != null ? ` ${nr}` : ""}%`);
    if (postnr) q = q.eq("zip", postnr);
    const { data: lokale } = await q;
    for (const r of (lokale ?? []) as any[]) {
      if (r.is_active === false) continue;
      const ex = hits.get(r.p_number);
      if (ex) {
        ex.kilde = "begge";
        ex.ansatte = ex.ansatte ?? r.ansatte_interval;
      } else {
        hits.set(r.p_number, {
          p_number: r.p_number, name: r.name, address: r.address, zip: r.zip, city: r.city,
          ansatte: r.ansatte_interval, kilde: "lokal", cvr: r.cvr, hoved: null, crm: [], linkedLocation: null,
        });
      }
    }

    const list = Array.from(hits.values()).slice(0, 30);
    const cvrs = Array.from(new Set(list.map((h) => h.cvr).filter(Boolean) as string[]));

    // 3) Hovedselskaber
    if (cvrs.length) {
      try {
        const json = await es("virksomhed", {
          _source: ["Vrvirksomhed.cvrNummer", "Vrvirksomhed.virksomhedMetadata.nyesteNavn.navn", "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse"],
          query: { terms: { "Vrvirksomhed.cvrNummer": cvrs.map((c) => parseInt(c, 10)) } },
          size: cvrs.length,
        });
        const m = new Map<string, AdresseHit["hoved"]>();
        for (const h of json?.hits?.hits ?? []) {
          const v = h?._source?.Vrvirksomhed;
          if (!v) continue;
          m.set(String(v.cvrNummer).padStart(8, "0"), {
            name: v.virksomhedMetadata?.nyesteNavn?.navn ?? null,
            ...fmtAdr(v.virksomhedMetadata?.nyesteBeliggenhedsadresse),
          });
        }
        for (const h of list) if (h.cvr) h.hoved = m.get(h.cvr) ?? null;
      } catch (e: any) {
        cvrFejl = cvrFejl ?? e?.message ?? "CVR-opslag fejlede";
      }
    }

    // 4) Findes i CRM?
    const crm = await crmForCvrs(context.supabase, cvrs);
    for (const h of list) if (h.cvr) h.crm = crm.get(h.cvr) ?? [];

    const pnr = list.map((h) => h.p_number);
    if (pnr.length) {
      const { data: links } = await context.supabase
        .from("location_pnr_link")
        .select("p_nummer, location_id, kilde")
        .in("p_nummer", pnr)
        .in("kilde", ["auto", "manuel"])
        .not("location_id", "is", null);
      const locIds = (links ?? []).map((l: any) => l.location_id);
      if (locIds.length) {
        const { data: locs } = await context.supabase
          .from("locations")
          .select("id, company_id, address, city, companies(name)")
          .in("id", locIds);
        const byId = new Map((locs ?? []).map((l: any) => [l.id, l]));
        for (const l of links ?? []) {
          const loc: any = byId.get((l as any).location_id);
          const h = list.find((x) => x.p_number === (l as any).p_nummer);
          if (loc && h) {
            h.linkedLocation = {
              id: loc.id, company_id: loc.company_id, company_name: loc.companies?.name ?? "",
              address: loc.address, city: loc.city,
            };
          }
        }
      }
    }

    return { hits: list, cvrFejl };
  });

export type KoncernSelskab = {
  cvr: string;
  name: string | null;
  city: string | null;
  ejerandel: number | null;
  crm: { id: string; name: string }[];
};

/**
 * Moderselskab (≥50 % ejerandel i Ejerregistret) og dets øvrige
 * datterselskaber (= søsterselskaber) fra CVR.
 */
export const cvrKoncern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ cvr: z.string().regex(/^\d{8}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    // Find aktuelle ejere i Ejerregistret
    function aktuelleEjere(v: any): { enhed: number; navn: string | null; andel: number }[] {
      const ud: { enhed: number; navn: string | null; andel: number }[] = [];
      for (const r of v?.deltagerRelation ?? []) {
        if (r?.deltager?.enhedstype !== "VIRKSOMHED") continue;
        for (const o of r.organisationer ?? []) {
          if (o?.hovedtype !== "REGISTER") continue;
          for (const md of o.medlemsData ?? []) {
            const pct = (md.attributter ?? []).find((a: any) => a.type === "EJERANDEL_PROCENT");
            const cur = (pct?.vaerdier ?? []).find((x: any) => !x?.periode?.gyldigTil);
            if (cur) {
              const navne = r.deltager.navne ?? [];
              ud.push({
                enhed: r.deltager.enhedsNummer,
                navn: (navne.find((n: any) => !n?.periode?.gyldigTil) ?? navne[navne.length - 1])?.navn ?? null,
                andel: parseFloat(cur.vaerdi),
              });
            }
          }
        }
      }
      return ud;
    }

    const self = await es("virksomhed", {
      _source: ["Vrvirksomhed.deltagerRelation"],
      query: { term: { "Vrvirksomhed.cvrNummer": parseInt(data.cvr, 10) } },
      size: 1,
    });
    const v = self?.hits?.hits?.[0]?._source?.Vrvirksomhed;
    const ejere = aktuelleEjere(v).filter((e) => e.andel >= 0.5);
    if (!ejere.length) return { moder: null as KoncernSelskab | null, soestre: [] as KoncernSelskab[] };
    const moderEnhed = ejere[0];

    const [moderRes, kandRes] = await Promise.all([
      es("virksomhed", {
        _source: ["Vrvirksomhed.cvrNummer", "Vrvirksomhed.virksomhedMetadata.nyesteNavn.navn", "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse"],
        query: { term: { "Vrvirksomhed.enhedsNummer": moderEnhed.enhed } },
        size: 1,
      }),
      es("virksomhed", {
        _source: [
          "Vrvirksomhed.cvrNummer", "Vrvirksomhed.deltagerRelation",
          "Vrvirksomhed.virksomhedMetadata.nyesteNavn.navn",
          "Vrvirksomhed.virksomhedMetadata.nyesteBeliggenhedsadresse",
          "Vrvirksomhed.virksomhedMetadata.sammensatStatus",
        ],
        query: { term: { "Vrvirksomhed.deltagerRelation.deltager.enhedsNummer": moderEnhed.enhed } },
        size: 200,
      }),
    ]);

    const mv = moderRes?.hits?.hits?.[0]?._source?.Vrvirksomhed;
    const soestreRaw: KoncernSelskab[] = [];
    for (const h of kandRes?.hits?.hits ?? []) {
      const s = h?._source?.Vrvirksomhed;
      if (!s) continue;
      const cvr = String(s.cvrNummer).padStart(8, "0");
      if (cvr === data.cvr) continue;
      const st = String(s.virksomhedMetadata?.sammensatStatus ?? "").toUpperCase();
      if (st !== "NORMAL" && st !== "AKTIV") continue;
      const ej = aktuelleEjere(s).find((e) => e.enhed === moderEnhed.enhed && e.andel >= 0.5);
      if (!ej) continue;
      soestreRaw.push({
        cvr,
        name: s.virksomhedMetadata?.nyesteNavn?.navn ?? null,
        city: s.virksomhedMetadata?.nyesteBeliggenhedsadresse?.postdistrikt ?? null,
        ejerandel: ej.andel,
        crm: [],
      });
    }
    const moder: KoncernSelskab = {
      cvr: mv?.cvrNummer != null ? String(mv.cvrNummer).padStart(8, "0") : "",
      name: mv?.virksomhedMetadata?.nyesteNavn?.navn ?? moderEnhed.navn,
      city: mv?.virksomhedMetadata?.nyesteBeliggenhedsadresse?.postdistrikt ?? null,
      ejerandel: moderEnhed.andel,
      crm: [],
    };
    const crm = await crmForCvrs(context.supabase, [moder.cvr, ...soestreRaw.map((s) => s.cvr)].filter(Boolean));
    moder.crm = (crm.get(moder.cvr) ?? []).map((c) => ({ id: c.id, name: c.name }));
    for (const s of soestreRaw) s.crm = (crm.get(s.cvr) ?? []).map((c) => ({ id: c.id, name: c.name }));
    soestreRaw.sort((a, b) => Number(b.crm.length > 0) - Number(a.crm.length > 0) || (a.name ?? "").localeCompare(b.name ?? ""));
    return { moder, soestre: soestreRaw };
  });
