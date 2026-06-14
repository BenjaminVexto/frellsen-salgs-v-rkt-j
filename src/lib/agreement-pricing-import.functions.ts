import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PricingRow = z
  .object({
    kundeprisgruppe2: z.string().nullable().optional(),
    produktprisgruppe1: z.string().nullable().optional(),
    produktprisgruppe2: z.string().nullable().optional(),
    produktprisgruppe3: z.string().nullable().optional(),
    varenr: z.string().nullable().optional(),
    beskrivelse: z.string().nullable().optional(),
    rab_kr: z.number().nullable().optional(),
    rab_pct: z.number().nullable().optional(),
    udsalgspris: z.number().nullable().optional(),
    udlejningspris: z.number().nullable().optional(),
    kampagne: z.string().nullable().optional(),
    kommentar: z.string().nullable().optional(),
    fra_dato: z.string().nullable().optional(),
    til_dato: z.string().nullable().optional(),
    fak_kundenr: z.string().nullable().optional(),
  })
  .passthrough();

const t = (s: unknown): string => (s == null ? "" : String(s).trim());

function deriveRabatKategori(
  pg3: string | null | undefined,
  pg2: string | null | undefined,
  beskrivelse: string | null | undefined,
): string {
  const sources = [pg3, pg2, beskrivelse].map((s) => (s ?? "").toString());
  const joined = sources.join(" ").toLowerCase();
  if (/\bh\.?b\b/.test(joined) || /\bhb\b/.test(joined)) return "Hele bønner";
  if (/vac/.test(joined)) return "VAC kaffe";
  if (/instant/.test(joined)) return "Instant";
  // produktgruppe-kode 78 / 79 — i pg2 eller pg3
  const codeStr = ((pg2 ?? "") + " " + (pg3 ?? "")).trim();
  const codeMatch = codeStr.match(/(?:^|\D)(\d{2,3})(?:\D|$)/);
  if (codeMatch) {
    const code = parseInt(codeMatch[1], 10);
    if (code === 78) return "Maskiner";
    if (code === 79) return "Tilbehør";
  }
  return "Øvrige";
}

export const importAgreementPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rows: z.array(PricingRow).max(500000).default([]),
        diagnostics: z
          .object({
            file: z.string().optional(),
            headerRow: z.number().optional(),
            mapped: z.array(z.string()).optional(),
            missing: z.array(z.string()).optional(),
            unknown: z.array(z.string()).optional(),
            rowCount: z.number().optional(),
            distinctKundeprisgruppe2: z.number().optional(),
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
    console.log("[pricing-import] diagnostics:", JSON.stringify(diag));
    console.log(`[pricing-import] parsed rows=${data.rows.length}`);

    if (data.rows.length === 0) {
      throw new Error("Ingen rækker at importere");
    }

    const importedAt = new Date().toISOString();

    const dupCounter = new Map<string, number>();
    const outRows: any[] = [];
    let skippedEmpty = 0;
    for (const r of data.rows) {
      const kpg2 = t(r.kundeprisgruppe2);
      const pg1 = t(r.produktprisgruppe1);
      const pg2 = t(r.produktprisgruppe2);
      const pg3 = t(r.produktprisgruppe3);
      const varenr = t(r.varenr);
      const beskrivelse = t(r.beskrivelse);
      const fra = r.fra_dato ?? null;
      const til = r.til_dato ?? null;

      if (!kpg2 && !varenr && !beskrivelse && !pg2 && !pg3) {
        skippedEmpty++;
        continue;
      }

      const hashInput = [kpg2, pg2, pg3, varenr, fra ?? ""].join("|");
      const hash = crypto.createHash("sha1").update(hashInput).digest("hex");
      const idx = dupCounter.get(hash) ?? 0;
      dupCounter.set(hash, idx + 1);

      outRows.push({
        id: idx === 0 ? hash : `${hash}-${idx}`,
        kundeprisgruppe2: kpg2 || null,
        produktprisgruppe1: pg1 || null,
        produktprisgruppe2: pg2 || null,
        produktprisgruppe3: pg3 || null,
        varenr: varenr || null,
        beskrivelse: beskrivelse || null,
        rab_kr: r.rab_kr ?? null,
        rab_pct: r.rab_pct ?? null,
        udsalgspris: r.udsalgspris ?? null,
        udlejningspris: r.udlejningspris ?? null,
        kampagne: t(r.kampagne) || null,
        kommentar: t(r.kommentar) || null,
        fra_dato: fra,
        til_dato: til,
        rabat_kategori: deriveRabatKategori(pg3, pg2, beskrivelse),
        record_status: "aktiv",
        last_seen_import: importedAt,
        udgaaet_dato: null,
      });
    }
    console.log(
      `[pricing-import] outRows=${outRows.length} skippedEmpty=${skippedEmpty}`,
    );

    const { count: countBefore } = await supabaseAdmin
      .from("agreement_pricing" as any)
      .select("id", { count: "exact", head: true });
    console.log(`[pricing-import] countBefore=${countBefore ?? 0}`);

    const CHUNK = 1000;
    let upserted = 0;
    for (let i = 0; i < outRows.length; i += CHUNK) {
      const slice = outRows.slice(i, i + CHUNK);
      try {
        const { error, status, statusText } = await supabaseAdmin
          .from("agreement_pricing" as any)
          .upsert(slice, { onConflict: "id" });
        if (error) {
          const msg = `pricing upsert chunk ${i}: ${error.message} (code=${(error as any).code}, details=${(error as any).details}, hint=${(error as any).hint}, http=${status} ${statusText})`;
          console.error("[pricing-import]", msg, "førsterække:", JSON.stringify(slice[0]));
          throw new Error(msg);
        }
        upserted += slice.length;
      } catch (e: any) {
        console.error(`[pricing-import] chunk ${i} FEJL:`, e?.message ?? String(e));
        throw e;
      }
    }
    console.log(`[pricing-import] upserted=${upserted}`);

    // Markér rækker fra tidligere import som udgået
    let markedUdgaaet = 0;
    {
      const { data: upd, error } = await supabaseAdmin
        .from("agreement_pricing" as any)
        .update({ record_status: "udgaaet", udgaaet_dato: importedAt })
        .or(`last_seen_import.is.null,last_seen_import.lt.${importedAt}`)
        .neq("record_status", "udgaaet")
        .select("id");
      if (error) throw new Error("pricing udgået-mark: " + JSON.stringify(error));
      markedUdgaaet = upd?.length ?? 0;
    }

    const { count: countAfter } = await supabaseAdmin
      .from("agreement_pricing" as any)
      .select("id", { count: "exact", head: true });
    console.log(`[pricing-import] countAfter=${countAfter ?? 0}`);

    return {
      rowsParsed: data.rows.length,
      rowsBuilt: outRows.length,
      skippedEmpty,
      upserted,
      markedUdgaaet,
      countBefore: countBefore ?? 0,
      countAfter: countAfter ?? 0,
      importedAt,
    };
  });
