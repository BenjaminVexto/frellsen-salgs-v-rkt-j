import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kraevIntern } from "@/lib/kraev-intern";
import { afsendKatalog } from "@/lib/katalog-afsendelse";
import { katalogMailHtml } from "@/lib/mail-html";

export const sendKatalogMail = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((input: unknown) => z.object({
    companyId: z.string().uuid(), locationId: z.string().uuid().nullable().optional(),
    email: z.string().trim().email().max(320), navn: z.string().trim().max(200),
    afdelingNr: z.number().int().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    // Kataloget forbliver en admintest, også ved direkte RPC-kald.
    const { data: admin, error: roleError } = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Kun administratorer kan sende katalog indtil testen er afsluttet");
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
    const { data: ind, error: indError } = await db.from("katalog_indstilling").select("katalog_url, forside_billede_url").maybeSingle();
    if (indError) throw new Error(indError.message);
    if (!ind?.katalog_url || !/^https?:\/\//.test(ind.katalog_url)) throw new Error("Katalog-link er ikke sat op (Admin → Katalog)");
    const { sendGraphMail } = await import("@/lib/graph-mail.server");
    return afsendKatalog({
      opret: async () => {
        const { data: row, error } = await db.from("katalog_udsendelser").insert({
          company_id: data.companyId, location_id: lid, modtager_email: data.email.toLowerCase(),
          modtager_navn: data.navn || null, katalog_url: ind.katalog_url, sendt_af: context.userId, status: "afventer",
        }).select("id").single();
        if (error) throw new Error(error.message);
        return row.id;
      },
      send: async (id) => sendGraphMail({ email: data.email, navn: data.navn, sellerName, sellerEmail,
        subject: "Frellsen Kaffes katalog", html: katalogMailHtml({ navn: data.navn, sellerName,
          link: `https://frellsen.lovable.app/k/${id}`, billede: ind.forside_billede_url }),
      }),
      fejlet: async (id) => {
        const { error } = await db.from("katalog_udsendelser").update({ status: "fejlet" }).eq("id", id);
        if (error) throw new Error(error.message);
      },
      sendt: async (id) => {
        const { error } = await db.from("katalog_udsendelser").update({ status: "sendt", sendt_at: new Date().toISOString() }).eq("id", id);
        if (error) throw new Error(`Mailen er sendt, men registreringen fejlede: ${error.message}`);
      },
      afslut: async (id) => {
        const { error } = await db.rpc("katalog_afslut", { _id: id, _afdeling_nr: data.afdelingNr ?? undefined });
        if (error) throw new Error(`Mailen er sendt, men kontakt/opfølgning kunne ikke gemmes: ${error.message}`);
      },
    });
  });