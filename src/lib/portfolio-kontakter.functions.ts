import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PortfolioKontaktRow = {
  company_id: string;
  visma_id: string | null;
  cvr: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  afdeling: string | null;
  kundeprisgruppe1: string | null;
  kontaktperson: string | null;
  titel: string | null;
  telefon: string | null;
  email: string | null;
  kontaktkilde: "Kontakt i CRM" | "Visma kunde" | "Visma leveringsadresse" | null;
};

const CHUNK = 500;
const blank = (v: any) => (v == null || String(v).trim() === "" ? null : String(v).trim());

export const getPortfolioKontakter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ companyIds: z.array(z.string().uuid()).max(20000) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const ids = Array.from(new Set(data.companyIds));
    const comps: any[] = [];
    const contacts: any[] = [];
    const locs: any[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const [c, k, l] = await Promise.all([
        sb.from("companies").select("id,visma_id,cvr,address,zip,city,afdeling_nr,customer_segment_1,contact_person,phone,email").in("id", slice),
        sb.from("contacts").select("company_id,name,title,phone,email,is_primary,created_at").in("company_id", slice),
        sb.from("locations").select("company_id,contact_person,phone,email,is_primary,created_at").in("company_id", slice),
      ]);
      if (c.error) throw c.error;
      if (k.error) throw k.error;
      if (l.error) throw l.error;
      comps.push(...(c.data ?? []));
      contacts.push(...(k.data ?? []));
      locs.push(...(l.data ?? []));
    }
    const { data: afd } = await sb.from("afdeling").select("afdeling_nr,navn");
    const afdNavn = new Map<number, string>((afd ?? []).map((a: any) => [a.afdeling_nr, a.navn]));

    const group = <T extends { company_id: string }>(arr: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of arr) (m.get(r.company_id) ?? m.set(r.company_id, []).get(r.company_id)!).push(r);
      return m;
    };
    const kByC = group(contacts);
    const lByC = group(locs);

    const rows: PortfolioKontaktRow[] = comps.map((c) => {
      const ks = (kByC.get(c.id) ?? []).filter((k) => blank(k.name));
      const ls = (lByC.get(c.id) ?? []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const primLoc = ls.find((l) => l.is_primary) ?? null;
      let person: string | null = null, titel: string | null = null, tlf: string | null = null, mail: string | null = null;
      let kilde: PortfolioKontaktRow["kontaktkilde"] = null;
      const kPrim = ks.find((k) => k.is_primary);
      const kNy = ks.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      const k = kPrim ?? kNy;
      if (k) {
        person = blank(k.name); titel = blank(k.title); tlf = blank(k.phone); mail = blank(k.email); kilde = "Kontakt i CRM";
      } else if (blank(c.contact_person)) {
        person = blank(c.contact_person); tlf = blank(c.phone); mail = blank(c.email); kilde = "Visma kunde";
      } else {
        const l = (primLoc && blank(primLoc.contact_person) ? primLoc : null) ?? ls.find((x) => blank(x.contact_person));
        if (l) { person = blank(l.contact_person); tlf = blank(l.phone); mail = blank(l.email); kilde = "Visma leveringsadresse"; }
      }
      tlf = tlf ?? blank(c.phone) ?? blank(primLoc?.phone);
      mail = mail ?? blank(c.email) ?? blank(primLoc?.email);
      return {
        company_id: c.id,
        visma_id: c.visma_id ?? null,
        cvr: c.cvr ?? null,
        address: c.address ?? null,
        zip: c.zip ?? null,
        city: c.city ?? null,
        afdeling: afdNavn.get(c.afdeling_nr) ?? (c.afdeling_nr != null ? String(c.afdeling_nr) : null),
        kundeprisgruppe1: c.customer_segment_1 ?? null,
        kontaktperson: person, titel, telefon: tlf, email: mail, kontaktkilde: kilde,
      };
    });
    return { rows };
  });
