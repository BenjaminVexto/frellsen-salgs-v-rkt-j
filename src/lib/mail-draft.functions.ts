import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MailPurpose =
  | "opfølgning"
  | "mersalg"
  | "genvinding"
  | "intro";

const PURPOSE_BRIEF: Record<MailPurpose, string> = {
  opfølgning:
    "FORMÅL: Følg op / hold kontakt. Tonen er varm og let; mind kort om sidste interaktion eller leverance, spørg hvordan det går, og foreslå et naturligt næste skridt (kort opkald, besøg eller blot at høre om de mangler noget).",
  mersalg:
    "FORMÅL: Tilbud / mersalg. Tag udgangspunkt i et konkret hul (fx 'I har Frellsen-maskine men køber ikke kaffe hos os', manglende te/choko/automatvarer, eller produktkategori de bør prøve). Skriv kort hvorfor det giver mening for DEM, og foreslå en konkret prøveordre eller et hurtigt opkald.",
  genvinding:
    "FORMÅL: Genvinding. Kunden er sovende / på vej væk / tabt. Anerkend at det er længe siden, undgå skyld, vis at vi gerne vil tilbage. Tilbyd en konkret grund til at åbne dialogen igen (nyt produkt, bedre pris, prøveordre, kort besøg). Ingen lange undskyldninger.",
  intro:
    "FORMÅL: Intro / første kontakt. Kunden kender os ikke endnu. Præsentér Frellsen Kaffe meget kort (dansk familieejet, kaffe + maskiner + service), nævn én konkret grund til at det kunne være relevant for netop dem, og foreslå et kort uforpligtende opkald eller en smagsprøve.",
};

export const generateMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        purpose: z.enum(["opfølgning", "mersalg", "genvinding", "intro"]),
        contact_name: z.string().max(200).optional().nullable(),
        contact_email: z.string().max(320).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [companyRes, activitiesRes, oppsRes, competitorRes, profileRes] =
      await Promise.all([
        supabaseAdmin
          .from("companies")
          .select(
            "name, city, industry, last_purchase_date, customer_segment_1, customer_segment_2, customer_type, sources",
          )
          .eq("id", data.company_id)
          .single(),
        supabaseAdmin
          .from("activities")
          .select("activity_type, note, created_at")
          .eq("company_id", data.company_id)
          .order("created_at", { ascending: false })
          .limit(3),
        supabaseAdmin
          .from("sales_opportunities")
          .select("name, status, estimated_value")
          .eq("company_id", data.company_id)
          .not("status", "in", "(vundet,tabt)")
          .limit(5),
        supabaseAdmin
          .from("competitor_assignments")
          .select("contract_expires_at, competitors(name)")
          .eq("company_id", data.company_id)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", context.userId)
          .maybeSingle(),
      ]);

    const company = companyRes.data as any;
    if (!company) throw new Error("Virksomhed ikke fundet");

    const seg2 = (company.customer_segment_2 ?? "").toString();
    const hasMaskine = /UDLÅN|LEJE|Maskine/i.test(seg2);
    const lastPurchase = company.last_purchase_date as string | null;
    const daysSinceBuy = lastPurchase
      ? Math.floor(
          (Date.now() - new Date(lastPurchase).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;
    const maskineUdenKaffe =
      hasMaskine && (daysSinceBuy === null || daysSinceBuy > 60);

    const activities = activitiesRes.data ?? [];
    const opps = oppsRes.data ?? [];
    const competitor = competitorRes.data as any;
    const senderName = profileRes.data?.full_name?.trim() || "Frellsen Kaffe";

    const contextBlock = `
KUNDE: ${company.name}
By: ${company.city ?? "—"}
Branche: ${company.industry ?? "—"}
Kundetype: ${company.customer_type ?? "—"}
Sidste varekøb: ${lastPurchase ?? "Ingen registreret"} ${daysSinceBuy !== null ? `(${daysSinceBuy} dage siden)` : ""}
Customer segment 2: ${seg2 || "—"}
Maskine fra Frellsen: ${hasMaskine ? "Ja" : "Nej/ukendt"}
${maskineUdenKaffe ? "⚠️ SIGNAL: Har maskine fra Frellsen men køber ikke kaffe (mersalgs-vinkel)." : ""}

KONTAKT: ${data.contact_name ?? "Ingen specifik kontakt valgt"}
Email: ${data.contact_email ?? "—"}

SENESTE AKTIVITETER:
${activities.length ? activities.map((a: any) => `- [${a.activity_type}] ${new Date(a.created_at).toLocaleDateString("da")}: ${(a.note ?? "").substring(0, 120)}`).join("\n") : "Ingen aktiviteter"}

ÅBNE SALGSMULIGHEDER:
${opps.length ? opps.map((o: any) => `- ${o.name} (${o.status})`).join("\n") : "Ingen"}

KONKURRENTAFTALE:
${competitor ? `${competitor.competitors?.name ?? "Ukendt"} — udløber ${competitor.contract_expires_at ?? "ukendt"}` : "Ingen registreret"}
`.trim();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY mangler");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: `Du skriver en kort, konkret salgsmail på dansk for en sælger hos Frellsen Kaffe (dansk familieejet kaffeleverandør med maskiner og service).

KRAV:
- MAKS 120 ord i brødteksten. Mailto har en længdegrænse — hold det kort.
- Naturlig, kollegial, professionel tone. Ingen marketing-floskler. Ingen emoji.
- Brug kontaktens fornavn hvis tilgængeligt; ellers en høflig generisk åbning ("Hej").
- Underskrift: kun "Venlig hilsen\\n${senderName}\\nFrellsen Kaffe" — ingen telefonnummer eller andet.
- Vær konkret om næste skridt (fx "kort opkald i næste uge", "smagsprøve", "tilbud").
- Brug ALDRIG oplysninger der ikke fremgår af kontekst-blokken. Opfind ikke navne, tal, leverandører eller aftaler.
- Hvis "maskine uden kaffe"-signal nævnes i konteksten OG formålet er mersalg, skal mailen netop tage udgangspunkt i det (uden at lyde anklagende).

OUTPUT FORMAT (ren tekst, intet andet):
EMNE: <kort, konkret emnelinje, maks 70 tegn>
---
<brødtekst inkl. hilsen + underskrift>`,
        messages: [
          {
            role: "user",
            content: `${PURPOSE_BRIEF[data.purpose as MailPurpose]}

KONTEKST:
${contextBlock}

Skriv mailen nu i det krævede format.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API fejl: ${err}`);
    }

    const result = await response.json();
    const text = ((result.content as any[]) ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // Parse "EMNE: ...\n---\n..." (tolerant)
    let subject = "";
    let body = text;
    const m = text.match(/^\s*EMNE\s*:\s*(.+?)\s*\n\s*-{2,}\s*\n([\s\S]*)$/i);
    if (m) {
      subject = m[1].trim();
      body = m[2].trim();
    } else {
      const lines = text.split("\n");
      const first = lines[0]?.replace(/^EMNE\s*:\s*/i, "").trim() ?? "";
      if (first && first.length < 120) {
        subject = first;
        body = lines.slice(1).join("\n").replace(/^-{2,}\s*\n?/, "").trim();
      }
    }
    if (!subject) subject = `${company.name} — fra Frellsen Kaffe`;

    return { subject, body };
  });
