import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { kraevIntern } from "@/lib/kraev-intern";
import type { Database } from "@/integrations/supabase/types";

/** Publishable-klient til offentlige (uloggede) kald mod token-RPC'erne. */
function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const tokenSchema = z.object({ token: z.string().min(8).max(200) });

export type OffentligTilbudInfo = {
  recipient_navn: string;
  quote_number: string | null;
  company_name: string | null;
  expiry_date: string | null;
  sent_date: string | null;
  seller_name: string | null;
  seller_email: string | null;
};

/** Offentlig: metadata til /t/[token]-siden. Returnerer null ved ugyldigt token. */
export const hentOffentligtTilbud = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }): Promise<OffentligTilbudInfo | null> => {
    const { data: d, error } = await publicClient().rpc("quote_recipient_by_token", { _token: data.token });
    if (error) throw new Error("Opslag fejlede");
    return (d as unknown as OffentligTilbudInfo | null) ?? null;
  });

/** Offentlig: spor åbning/download. Kaldes kun fra /t/[token] når besøgende IKKE er logget ind i CRM'et. */
export const sporQuoteEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(8).max(200),
        event: z.enum(["aabnet", "downloadet"]),
        user_agent: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: ok } = await publicClient().rpc("quote_track_event", {
      _token: data.token,
      _event: data.event,
      _user_agent: data.user_agent ?? undefined,
    });
    return { ok: ok === true };
  });

/** Offentlig: selve PDF'en bag et modtager-token. Token valideres før storage slås op. */
export const hentOffentligtTilbudPdf = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: info } = await publicClient().rpc("quote_recipient_by_token", { _token: data.token });
    if (!info) throw new Error("Linket er ikke gyldigt");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rec } = await supabaseAdmin
      .from("quote_recipients")
      .select("quote_id")
      .eq("token", data.token)
      .single();
    if (!rec) throw new Error("Linket er ikke gyldigt");
    const { data: q } = await supabaseAdmin
      .from("quotes")
      .select("pdf_path, quote_number")
      .eq("id", rec.quote_id)
      .single();
    if (!q?.pdf_path) throw new Error("Ikke fundet");
    const { data: file, error } = await supabaseAdmin.storage.from("quote-documents").download(q.pdf_path);
    if (error || !file) throw new Error("Kunne ikke hente PDF");
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return {
      base64: btoa(binary),
      filename: `Tilbud ${q.quote_number ?? ""}.pdf`.replace(" .pdf", ".pdf"),
      content_type: "application/pdf",
    };
  });

// ---------- Mailafsendelse via Microsoft Graph (kræver secrets, ikke sat op endnu) ----------

const MS_ENV = ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_AFSENDER"] as const;
function msKlar() {
  return MS_ENV.every((k) => !!process.env[k]);
}

/** Intern: er Graph-afsendelse konfigureret? Styrer om "Send på mail" er aktiv. */
export const tilbudMailKlar = createServerFn({ method: "GET" })
  .middleware([kraevIntern])
  .handler(async () => ({ klar: msKlar() }));

/**
 * Intern: send tilbudslink til en modtager via Microsoft Graph (client credentials).
 * Deaktiveret indtil MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET / MS_AFSENDER er sat op.
 */
export const sendTilbudMail = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((input: unknown) =>
    z
      .object({
        recipient_id: z.string().uuid(),
        tekst: z.string().max(4000).optional(),
        origin: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!msKlar()) return { ok: false as const, reason: "ikke_sat_op" as const };

    const { data: rec } = await context.supabase
      .from("quote_recipients")
      .select("id, navn, email, token, quote_id")
      .eq("id", data.recipient_id)
      .single();
    if (!rec) throw new Error("Modtager ikke fundet");

    const { data: q } = await context.supabase
      .from("quotes")
      .select("quote_number, expiry_date, companies(name)")
      .eq("id", rec.quote_id)
      .single();
    if (!q) throw new Error("Tilbud ikke fundet");

    const { data: prof } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .single();
    const sellerName = prof?.full_name ?? "Frellsen";
    const sellerEmail = (context.claims as Record<string, unknown> | undefined)?.email as string | undefined;

    const base = (data.origin ?? "https://frellsen.lovable.app").replace(/\/$/, "");
    const link = `${base}/t/${rec.token}`;
    const firma = (q.companies as { name?: string } | null)?.name ?? "";
    const tekst = (data.tekst ?? "").trim() || "Tak for et godt møde. Her er tilbuddet som aftalt.";
    const gyldig = q.expiry_date
      ? new Date(q.expiry_date).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })
      : null;

    const html = `
      <p>${tekst.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr>
        <td bgcolor="#1a1a1a" style="padding:12px 24px;border-radius:6px"><a href="${link}" style="color:#ffffff;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;display:inline-block">Se tilbud</a></td>
      </tr></table>
      <p style="color:#666;font-size:13px">
        Tilbud ${q.quote_number ?? ""}${firma ? ` til ${firma}` : ""}${gyldig ? ` · gyldig til ${gyldig}` : ""}
      </p>
      <p style="color:#666;font-size:13px">Venlig hilsen<br>${sellerName} · Frellsen Kaffe</p>`;

    // Client credentials -> Graph sendMail fra delt postkasse (MS_AFSENDER)
    const tenant = process.env["MS_TENANT_ID"]!;
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env["MS_CLIENT_ID"]!,
        client_secret: process.env["MS_CLIENT_SECRET"]!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Microsoft-login fejlede [${tokenRes.status}]: ${body}`);
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const afsender = process.env["MS_AFSENDER"]!;
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(afsender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: `Tilbud ${q.quote_number ?? ""} fra Frellsen Kaffe`,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: rec.email, name: rec.navn } }],
          from: { emailAddress: { address: afsender, name: `${sellerName} · Frellsen Kaffe` } },
          ...(sellerEmail ? { replyTo: [{ emailAddress: { address: sellerEmail, name: sellerName } }] } : {}),
        },
        saveToSentItems: true,
      }),
    });
    if (!sendRes.ok) {
      const body = await sendRes.text();
      throw new Error(`Mailafsendelse fejlede [${sendRes.status}]: ${body}`);
    }

    await context.supabase
      .from("quote_recipients")
      .update({ sendt_at: new Date().toISOString() })
      .eq("id", rec.id)
      .is("sendt_at", null);

    return { ok: true as const };
  });
