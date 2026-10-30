import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kraevIntern } from "@/lib/kraev-intern";
import { afsendKatalog } from "@/lib/katalog-afsendelse";
import { materialeMailHtml } from "@/lib/mail-html";
import { MATERIALE_BASE, materialeForsideUrl, materialeKilde } from "@/lib/materiale-url";

export const sendMaterialeMail = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((input: unknown) => z.object({
    companyId: z.string().uuid(), locationId: z.string().uuid().nullable().optional(),
    email: z.string().trim().email().max(320), navn: z.string().trim().max(200),
    materialeIds: z.array(z.string().uuid()).min(1, "Vælg mindst ét materiale").max(20),
    mailtekst: z.string().max(5000),
    afdelingNr: z.number().int().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    // Materialer forbliver en admintest, også ved direkte RPC-kald.
    const { data: admin, error: roleError } = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Kun administratorer kan sende materialer indtil testen er afsluttet");
    const sellerEmail = z.email().parse(context.claims.email);
    const { data: prof, error: profError } = await db.from("profiles").select("full_name").eq("id", context.userId).single();
    if (profError) throw new Error(profError.message);
    const sellerName = prof.full_name || "Frellsen";
    let lid = data.locationId ?? null;
    if (lid) {
      const { data: loc, error } = await db.from("locations").select("id").eq("id", lid).eq("company_id", data.companyId).single();
      if (error || !loc) throw new Error("Lokation ikke fundet på virksomheden");
    } else {
      const { data: loc, error } = await db.from("locations").select("id").eq("company_id", data.companyId).order("is_primary", { ascending: false }).order("created_at").limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      lid = loc?.id ?? null;
    }
    const ids = [...new Set(data.materialeIds)];
    const { data: mats, error: mErr } = await db.from("materialer").select("id, titel, type, url, pdf_path, forside_billede_path, opdateret_at, sortering")
      .in("id", ids).eq("aktiv", true).order("sortering").order("titel");
    if (mErr) throw new Error(mErr.message);
    if (!mats || mats.length !== ids.length) throw new Error("Et eller flere materialer er ikke længere aktive");
    const { sendGraphMail } = await import("@/lib/graph-mail.server");
    const gruppe = crypto.randomUUID();
    type Rk = { id: string; titel: string; billede: string | null };
    return afsendKatalog<Rk[]>({
      opret: async () => {
        const { data: rows, error } = await db.from("katalog_udsendelser").insert(mats.map((m) => ({
          company_id: data.companyId, location_id: lid, modtager_email: data.email.toLowerCase(),
          modtager_navn: data.navn || null, katalog_url: materialeKilde(m) ?? "", materiale_id: m.id, titel: m.titel,
          gruppe_id: gruppe, sendt_af: context.userId, status: "afventer",
        }))).select("id, materiale_id");
        if (error) throw new Error(error.message);
        return mats.map((m) => ({ id: rows.find((r) => r.materiale_id === m.id)!.id, titel: m.titel, billede: materialeForsideUrl(m) }));
      },
      send: async (rk) => sendGraphMail({ email: data.email, navn: data.navn, sellerName, sellerEmail,
        subject: rk.length === 1 ? `${rk[0].titel} fra Frellsen Kaffe` : "Materiale fra Frellsen Kaffe",
        html: materialeMailHtml({ navn: data.navn, sellerName, tekst: data.mailtekst,
          materialer: rk.map((r) => ({ titel: r.titel, billede: r.billede, link: `${MATERIALE_BASE}/k/${r.id}` })) }),
      }),
      fejlet: async () => {
        const { error } = await db.from("katalog_udsendelser").update({ status: "fejlet" }).eq("gruppe_id", gruppe);
        if (error) throw new Error(error.message);
      },
      sendt: async () => {
        const { error } = await db.from("katalog_udsendelser").update({ status: "sendt", sendt_at: new Date().toISOString() }).eq("gruppe_id", gruppe);
        if (error) throw new Error(`Mailen er sendt, men registreringen fejlede: ${error.message}`);
      },
      afslut: async () => {
        const { error } = await db.rpc("materiale_afslut", { _gruppe: gruppe, _afdeling_nr: data.afdelingNr ?? undefined });
        if (error) throw new Error(`Mailen er sendt, men kontakt/opfølgning kunne ikke gemmes: ${error.message}`);
      },
    });
  });
