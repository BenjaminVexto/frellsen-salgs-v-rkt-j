import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kraevIntern } from "@/lib/kraev-intern";
import { cvrHentEnkelt, cvrSoegNavn, cvrHentMange, type CvrCompany } from "@/lib/cvr-lookup.functions";
import { intervalTilAntal, erAktivCvr, type KundetjekStatus, type KundetjekHit } from "@/lib/kundetjek";

/** Ringer på listen eller admin — tjekkes med brugerens egen klient. */
async function kraevListeAdgang(sb: any, userId: string, listId: string) {
  const [{ data: ringer }, { data: admin }] = await Promise.all([
    sb.rpc("tm_er_ringer", { _list: listId }),
    sb.rpc("is_admin", { _user_id: userId }),
  ]);
  if (ringer !== true && admin !== true) throw new Error("Ingen adgang");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function matchRaekke(c: CvrCompany) {
  return {
    cvr: c.cvr,
    p_number: c.p_number ?? null,
    pnumre: c.p_number ? [c.p_number] : (c.pnumre ?? []).slice(0, 200),
    name: c.penhed_name ?? c.name,
    address: c.address,
    zip: c.zip,
    city: c.city,
    phone: c.phone,
  };
}

/** Listens sælger = den assigned_to der går igen på listen. */
async function listeSaelger(sb: any, listId: string): Promise<string | null> {
  const { data } = await sb.from("contact_list_assignments").select("assigned_to").eq("contact_list_id", listId).not("assigned_to", "is", null).limit(1000);
  const t = new Map<string, number>();
  for (const r of data ?? []) t.set(r.assigned_to, (t.get(r.assigned_to) ?? 0) + 1);
  let best: string | null = null; let n = 0;
  for (const [k, v] of t) if (v > n) { best = k; n = v; }
  return best;
}

export const kundetjekSoeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    list_id: z.string().uuid(),
    cvr: z.string().regex(/^\d{8}$/).optional(),
    name: z.string().min(2).max(100).optional(),
    location: z.string().max(40).optional(),
    agent_code: z.string().regex(/^[A-H]$/).nullable().optional(),
  }).refine(d => d.cvr || d.name, "Angiv CVR eller navn").parse(i))
  .handler(async ({ data, context }): Promise<{ hits: KundetjekHit[]; fejl?: string }> => {
    await kraevListeAdgang(context.supabase, context.userId, data.list_id);
    const res = data.cvr ? await cvrHentEnkelt(data.cvr) : await cvrSoegNavn(data.name!, data.location?.trim() || undefined, 10);
    if (!res.success) return { hits: [], fejl: res.error === "NOT_FOUND" ? "Ingen virksomheder fundet" : "CVR-opslag fejlede" };
    const firmaer = (Array.isArray(res.data) ? res.data : [res.data]).slice(0, 10);
    const sb = await admin();
    const { data: st, error } = await sb.rpc("kundetjek_status", {
      _user: context.userId, _list: data.list_id, cvr_rows: firmaer.map(matchRaekke), _agent_code: data.agent_code ?? null,
    });
    if (error) throw new Error(error.message.includes("Dagsgrænse") ? "Dagsgrænse for kundetjek nået" : error.message);
    const rows = (st ?? []) as { cvr: string; p_nummer: string | null; status: KundetjekStatus; saelger_navn: string | null; liste_navn: string | null }[];

    // Afvigende distrikt: kun når listens sælger har et distrikt i det gældende kort
    const saelger = await listeSaelger(sb, data.list_id);
    let harDistrikt = false;
    if (saelger) {
      const { count } = await sb.from("distrikter").select("id", { count: "exact", head: true }).eq("aktiv", true).or(`saelger_user_id.eq.${saelger},daekkes_af_user_id.eq.${saelger}`);
      harDistrikt = (count ?? 0) > 0;
    }
    const zipCache = new Map<string, boolean>();
    const udenFor = async (zip: string | null) => {
      if (!harDistrikt || !zip) return false;
      if (!zipCache.has(zip)) {
        const { data: d } = await sb.rpc("_distrikt_saelger", { _postnr: zip });
        zipCache.set(zip, ((d ?? [])[0]?.saelger_user_id ?? null) !== saelger);
      }
      return zipCache.get(zip)!;
    };

    const hits: KundetjekHit[] = [];
    for (let i = 0; i < firmaer.length; i++) {
      const c = firmaer[i];
      const r = rows.find(x => x.cvr === c.cvr && (x.p_nummer ?? null) === (c.p_number ?? null)) ?? rows[i];
      hits.push({
        cvr: c.cvr,
        p_number: c.p_number ?? null,
        navn: c.penhed_name ?? c.name,
        adresse: c.address, postnr: c.zip, by: c.city,
        branche: c.main_branch_text, ansatte: c.employees_interval, telefon: c.phone,
        reklamebeskyttet: !!c.ad_protection,
        status: r?.status ?? "ikke_kunde",
        saelger_navn: r?.saelger_navn ?? null,
        liste_navn: r?.liste_navn ?? null,
        uden_for_distrikt: r?.status === "ikke_kunde" ? await udenFor(c.zip) : false,
      });
    }
    return { hits };
  });

export const kundetjekTilfoej = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    list_id: z.string().uuid(),
    cvr: z.string().regex(/^\d{8}$/),
    p_number: z.string().regex(/^\d{1,12}$/).nullable().optional(),
    agent_code: z.string().regex(/^[A-H]$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await kraevListeAdgang(context.supabase, context.userId, data.list_id);
    // Frisk fra CVR — klientdata bruges ikke
    const res = await cvrHentEnkelt(data.cvr);
    if (!res.success || Array.isArray(res.data)) throw new Error("Virksomheden blev ikke fundet i CVR");
    const c = res.data;
    if (c.ad_protection) throw new Error("Reklamebeskyttet – må ikke ringes op");
    if (!erAktivCvr(c.status)) throw new Error("Virksomheden er ophørt");
    const sb = await admin();
    const row = {
      cvr: c.cvr, pnumre: data.p_number ? [data.p_number] : (c.pnumre ?? []).slice(0, 200), p_number: data.p_number ?? null,
      name: c.name, address: c.address, zip: c.zip, city: c.city, municipality: c.municipality, phone: c.phone,
      email: c.email, website: c.website, industry: c.main_branch_text, employees: intervalTilAntal(c.employees_interval),
    };
    const { data: r, error } = await sb.rpc("tm_tilfoej_emne", { _user: context.userId, _list: data.list_id, _row: row, _agent_code: data.agent_code });
    if (error) throw new Error(error.message);
    const cid = (r as any)?._cid as string | undefined;
    // Direktør fra CVR (samme logik som direktør-jobbet) — fejl må ikke stoppe tilføjelsen
    if (cid && process.env["CVR_USERNAME"] && process.env["CVR_PASSWORD"]) {
      try {
        const { berigDirektoerer } = await import("@/lib/cvr-direktoer");
        await berigDirektoerer(sb, [cid], { user: process.env["CVR_USERNAME"]!, pass: process.env["CVR_PASSWORD"]! });
      } catch (e) { console.error("Direktørberigelse fejlede:", (e as any)?.message ?? e); }
    }
    return { ok: true as const, navn: (r as any)?.navn as string };
  });

type Resultat = "tilfoejet" | "kunde" | "paa_liste" | "anden_liste" | "ikke_fundet" | "afvist";
type FirmaStatus = { company_id: string; status: string; liste_ids: string[] };

async function firmaStatus(sb: any, ids: string[]) {
  const m = new Map<string, FirmaStatus>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.rpc("_kundetjek_firmaer", { _ids: ids.slice(i, i + 200) });
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as FirmaStatus[]) m.set(r.company_id, r);
  }
  return m;
}

/** Fælles admin-regel: kunder/sælger arbejder → kunde, ikke kontakt → afvist, anden aktiv liste → anden_liste. */
function afgoer(f: FirmaStatus, listId: string): Exclude<Resultat, "tilfoejet" | "ikke_fundet"> | "ok" {
  if (f.status === "ikke_kontakt") return "afvist";
  if (f.status === "kunde" || f.status === "saelger_arbejder") return "kunde";
  if ((f.liste_ids ?? []).includes(listId)) return "paa_liste";
  if ((f.liste_ids ?? []).length) return "anden_liste";
  return "ok";
}

/** Admin: tilføj allerede importerede virksomheder (fra CVR-søgningen) til listen med samme regler. */
export const adminTilfoejFirmaer = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((i: unknown) => z.object({ list_id: z.string().uuid(), company_ids: z.array(z.string().uuid()).min(1).max(25000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: erAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!erAdmin) throw new Error("Kun administratorer");
    const sb = await admin();
    const ids = Array.from(new Set(data.company_ids));
    const fst = await firmaStatus(sb, ids);
    const saelger = await listeSaelger(sb, data.list_id);
    const ud = { tilfoejet: 0, kunde: 0, paa_liste: 0, anden_liste: 0, afvist: 0 };
    const ok: string[] = [];
    for (const id of ids) {
      const f = fst.get(id);
      const r = f ? afgoer(f, data.list_id) : "ok";
      if (r === "ok") ok.push(id); else ud[r]++;
    }
    // Nye emner uden sælger får listens sælger, som ved CVR-importen
    for (let i = 0; i < ok.length && saelger; i += 200)
      await sb.from("companies").update({ assigned_to: saelger }).in("id", ok.slice(i, i + 200)).eq("customer_type", "nyt_emne").is("assigned_to", null);
    for (let i = 0; i < ok.length; i += 500) {
      const { data: ins, error } = await sb.from("contact_list_assignments").upsert(
        ok.slice(i, i + 500).map(company_id => ({ contact_list_id: data.list_id, company_id, assigned_to: saelger, status: "ny" })),
        { onConflict: "contact_list_id,company_id", ignoreDuplicates: true },
      ).select("id");
      if (error) throw new Error(error.message);
      ud.tilfoejet += ins?.length ?? 0;
    }
    ud.paa_liste += ok.length - ud.tilfoejet;
    return ud;
  });

/** Admin: indsæt CVR-numre direkte på en liste. Kun nye/ikke-kunder tilføjes. */
export const adminIndsaetCvr = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((i: unknown) => z.object({ list_id: z.string().uuid(), cvrs: z.array(z.string().regex(/^\d{8}$/)).min(1).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: erAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!erAdmin) throw new Error("Kun administratorer");
    const cvrs = Array.from(new Set(data.cvrs));
    const firmaer = await cvrHentMange(cvrs);
    const fundet = new Map(firmaer.map(c => [c.cvr, c]));
    const ud = { tilfoejet: 0, kunde: 0, paa_liste: 0, anden_liste: 0, ikke_fundet: 0, afvist: 0 };
    const detaljer: { cvr: string; navn: string | null; resultat: Resultat }[] = [];
    const brugbare = firmaer.filter(c => {
      if (c.ad_protection || !erAktivCvr(c.status)) { ud.afvist++; detaljer.push({ cvr: c.cvr, navn: c.name, resultat: "afvist" }); return false; }
      return true;
    });
    for (const x of cvrs) if (!fundet.has(x)) { ud.ikke_fundet++; detaljer.push({ cvr: x, navn: null, resultat: "ikke_fundet" }); }
    const match = new Map<string, any>();
    for (let i = 0; i < brugbare.length; i += 200) {
      const { data: m, error } = await context.supabase.rpc("cvr_match_crm", { cvr_rows: brugbare.slice(i, i + 200).map(matchRaekke) as any });
      if (error) throw new Error(error.message);
      for (const r of (m ?? []) as any[]) match.set(r.cvr, r);
    }
    const sb = await admin();
    const ids = Array.from(new Set(Array.from(match.values()).map(m => m.company_id)));
    const fst = await firmaStatus(sb, ids);
    const saelger = await listeSaelger(sb, data.list_id);
    const nye: CvrCompany[] = []; const genbrug: { cvr: string; id: string; navn: string | null }[] = [];
    for (const c of brugbare) {
      const m = match.get(c.cvr);
      const f = m ? fst.get(m.company_id) : undefined;
      if (m && f) {
        const r = afgoer(f, data.list_id);
        if (r !== "ok") { ud[r]++; detaljer.push({ cvr: c.cvr, navn: c.name, resultat: r }); continue; }
      }
      if (m && m.sikker && f) genbrug.push({ cvr: c.cvr, id: m.company_id, navn: c.name });
      else nye.push(c);
    }
    const idPrCvr = new Map(genbrug.map(g => [g.cvr, g.id]));
    for (let i = 0; i < nye.length; i += 200) {
      const rows = nye.slice(i, i + 200).map(c => ({
        cvr: c.cvr, name: c.name ?? c.cvr, address: c.address, zip: c.zip, city: c.city, municipality: c.municipality,
        phone: c.phone, email: c.email, website: c.website, industry: c.main_branch_text, main_branch_text: c.main_branch_text,
        employees: intervalTilAntal(c.employees_interval), customer_type: "nyt_emne", sources: ["cvr"], assigned_to: saelger,
        source_created_by: context.userId, source_updated_at: new Date().toISOString(),
      }));
      const { data: ins, error } = await sb.from("companies").insert(rows).select("id, cvr");
      if (error) throw new Error(error.message);
      for (const r of ins ?? []) idPrCvr.set(r.cvr, r.id);
    }
    const kandidater = [...genbrug.map(g => ({ cvr: g.cvr, navn: g.navn })), ...nye.map(c => ({ cvr: c.cvr, navn: c.name }))];
    for (let i = 0; i < kandidater.length; i += 200) {
      const del = kandidater.slice(i, i + 200);
      const { data: ins, error } = await sb.from("contact_list_assignments").upsert(
        del.map(k => ({ contact_list_id: data.list_id, company_id: idPrCvr.get(k.cvr)!, assigned_to: saelger, status: "ny" })),
        { onConflict: "contact_list_id,company_id", ignoreDuplicates: true },
      ).select("company_id");
      if (error) throw new Error(error.message);
      const tilf = new Set((ins ?? []).map((r: any) => r.company_id));
      for (const k of del) {
        const r: Resultat = tilf.has(idPrCvr.get(k.cvr)) ? "tilfoejet" : "paa_liste";
        ud[r]++; detaljer.push({ cvr: k.cvr, navn: k.navn, resultat: r });
      }
    }
    return { ...ud, detaljer };
  });
