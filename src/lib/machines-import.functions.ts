import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MachineRow = z
  .object({
    ordrenr: z.string().nullable().optional(),
    varenr: z.string().nullable().optional(),
    beskrivelse: z.string().nullable().optional(),
    serienr: z.string().nullable().optional(),
    udlanstype: z.string().nullable().optional(),
    navn: z.string().nullable().optional(),
    fak_kundenr: z.string().nullable().optional(),
    lev_kundenr: z.string().nullable().optional(),
    adresselinje2: z.string().nullable().optional(),
    aendret_dato: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .passthrough();

// Strukturerede kolonner på machine_enrichment — alt andet havner i data jsonb.
const ENRICHMENT_COLUMN_FIELDS = new Set([
  "serienr",
  "taelleraflaesning",
  "binding_ophor",
  "beregnet_slutdato",
  "handlingsdato",
  "handlingsdato_raw",
]);

const EnrichmentRow = z
  .object({
    serienr: z.string(),
    taelleraflaesning: z.string().nullable().optional(),
    binding_ophor: z.string().nullable().optional(),
    beregnet_slutdato: z.string().nullable().optional(),
    handlingsdato: z.string().nullable().optional(),
    handlingsdato_raw: z.string().nullable().optional(),
    data: z.record(z.any()).nullable().optional(),
  })
  .passthrough();


const t = (s: unknown): string => (s == null ? "" : String(s).trim());

// Defensiv dato-normalisering: håndterer YYYY-MM-DD og YYYY-DD-MM (Visma).
function normDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  let mo = parseInt(m[2], 10);
  let d = parseInt(m[3], 10);
  if (mo > 12 && d <= 12) [mo, d] = [d, mo];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const importMachines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        machineRows: z.array(MachineRow).max(200000).default([]),
        enrichmentRows: z.array(EnrichmentRow).max(200000).default([]),
        diagnostics: z
          .object({
            machinesFile: z.string().optional(),
            enrichmentFile: z.string().optional(),
            machinesHeaderRow: z.number().optional(),
            enrichmentHeaderRow: z.number().optional(),
            machinesMapped: z.array(z.string()).optional(),
            enrichmentMapped: z.array(z.string()).optional(),
            machinesMissing: z.array(z.string()).optional(),
            enrichmentMissing: z.array(z.string()).optional(),
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
    console.log("[machines-import] diagnostics:", JSON.stringify(diag));
    console.log(
      `[machines-import] machineRows=${data.machineRows.length} enrichmentRows=${data.enrichmentRows.length}`,
    );

    // ---- Gate: serienr og kundenr på Maskinlisten ----
    if (data.machineRows.length > 0) {
      const withSerienr = data.machineRows.filter((r) => t(r.serienr)).length;
      const withKundenr = data.machineRows.filter(
        (r) => t(r.lev_kundenr) || t(r.fak_kundenr),
      ).length;
      console.log(
        `[machines-import] maskinliste sanity: withSerienr=${withSerienr} withKundenr=${withKundenr}`,
      );
      if (withSerienr === 0) {
        throw new Error(
          "Maskinlisten: 0 rækker har serienr — tjek header-detection eller alias-mapping",
        );
      }
      if (withKundenr === 0) {
        throw new Error(
          "Maskinlisten: 0 rækker har lev/fak kundenr — tjek header-detection",
        );
      }
    }
    if (data.enrichmentRows.length > 0) {
      const withSerienr = data.enrichmentRows.filter((r) => t(r.serienr)).length;
      console.log(`[machines-import] wittenborg sanity: withSerienr=${withSerienr}`);
      if (withSerienr === 0) {
        throw new Error("Wittenborg SN: 0 rækker har serienr — tjek header-detection");
      }
    }

    const importedAt = new Date().toISOString();
    console.log("[machines-import] STEP 1: bygger machineRows");

    const dupCounter = new Map<string, number>();
    const machineRows: any[] = [];
    for (const r of data.machineRows) {
      const ordrenr = t(r.ordrenr);
      const varenr = t(r.varenr);
      const beskrivelse = t(r.beskrivelse);
      const serienr = t(r.serienr);
      const udlanstype = t(r.udlanstype);
      if (!ordrenr && !varenr && !beskrivelse && !serienr && !udlanstype) continue;
      const hashInput = [ordrenr, varenr, beskrivelse, serienr, udlanstype].join("|");
      const hash = crypto.createHash("sha1").update(hashInput).digest("hex");
      const idx = dupCounter.get(hash) ?? 0;
      dupCounter.set(hash, idx + 1);
      machineRows.push({
        id: `${hash}-${idx}`,
        dup_index: idx,
        ordrenr: ordrenr || null,
        varenr: varenr || null,
        beskrivelse: beskrivelse || null,
        serienr: serienr || null,
        udlanstype: udlanstype || null,
        navn: t(r.navn) || null,
        fak_kundenr: t(r.fak_kundenr) || null,
        lev_kundenr: t(r.lev_kundenr) || null,
        adresselinje2: t(r.adresselinje2) || null,
        aendret_dato: normDate(r.aendret_dato),
        status: t(r.status) || null,
        record_status: "aktiv",
        last_seen_import: importedAt,
        udgaaet_dato: null,
      });
    }
    console.log(`[machines-import] STEP 2: machineRows=${machineRows.length}`);

    try {
      let machinesActiveBefore = 0;
      let enrichmentActiveBefore = 0;
      if (data.machineRows.length > 0) {
        const { count, error } = await supabaseAdmin
          .from("machines" as any)
          .select("id", { count: "exact", head: true })
          .eq("record_status", "aktiv");
        if (error) throw new Error("count machines aktiv: " + JSON.stringify(error));
        machinesActiveBefore = count ?? 0;
        console.log(`[machines-import] STEP 3a: machinesActiveBefore=${machinesActiveBefore}`);
      }
      if (data.enrichmentRows.length > 0) {
        const { count, error } = await supabaseAdmin
          .from("machine_enrichment" as any)
          .select("serienr", { count: "exact", head: true })
          .eq("record_status", "aktiv");
        if (error) throw new Error("count enrichment aktiv: " + JSON.stringify(error));
        enrichmentActiveBefore = count ?? 0;
        console.log(`[machines-import] STEP 3b: enrichmentActiveBefore=${enrichmentActiveBefore}`);
      }

      // Reaktivering-tælling sprang over (`.in()` med mange ids sprænger header-grænsen).
      // Slutresultat regnes af call-site som tabel-delta.
      let machinesReactivated = 0;

      const CHUNK = 1000;
      let machinesUpserted = 0;
      console.log(`[machines-import] STEP 5: machines upsert start (${machineRows.length} rows)`);
      for (let i = 0; i < machineRows.length; i += CHUNK) {
        const slice = machineRows.slice(i, i + CHUNK);
        const { error, status, statusText } = await supabaseAdmin
          .from("machines" as any)
          .upsert(slice, { onConflict: "id" });
        if (error) {
          const msg = `machines upsert chunk ${i}: ${error.message} (code=${(error as any).code}, details=${(error as any).details}, hint=${(error as any).hint}, http=${status} ${statusText})`;
          console.error("[machines-import]", msg, "førsterække:", JSON.stringify(slice[0]));
          throw new Error(msg);
        }
        machinesUpserted += slice.length;
      }
      console.log(`[machines-import] STEP 5 DONE: machinesUpserted=${machinesUpserted}`);

      let machinesMarkedUdgaaet = 0;
      if (data.machineRows.length > 0) {
        const { data: upd, error } = await supabaseAdmin
          .from("machines" as any)
          .update({ record_status: "udgaaet", udgaaet_dato: importedAt })
          .or(`last_seen_import.is.null,last_seen_import.lt.${importedAt}`)
          .neq("record_status", "udgaaet")
          .select("id");
        if (error) throw new Error("machines udgået-mark: " + JSON.stringify(error));
        machinesMarkedUdgaaet = upd?.length ?? 0;
        console.log(`[machines-import] STEP 6: machinesMarkedUdgaaet=${machinesMarkedUdgaaet}`);
      }

      const enrMap = new Map<string, any>();
      for (const r of data.enrichmentRows) {
        const serienr = t(r.serienr);
        if (!serienr) continue;
        const extras: Record<string, any> = { ...(r.data && typeof r.data === "object" ? r.data : {}) };
        for (const [k, v] of Object.entries(r as Record<string, any>)) {
          if (ENRICHMENT_COLUMN_FIELDS.has(k) || k === "data") continue;
          if (v == null || v === "") continue;
          extras[k] = v;
        }
        enrMap.set(serienr, {
          serienr,
          taelleraflaesning: r.taelleraflaesning || null,
          binding_ophor: r.binding_ophor || null,
          beregnet_slutdato: r.beregnet_slutdato || null,
          handlingsdato: r.handlingsdato || null,
          handlingsdato_raw: r.handlingsdato_raw || null,
          data: Object.keys(extras).length > 0 ? extras : null,
          record_status: "aktiv",
          last_seen_import: importedAt,
          udgaaet_dato: null,
        });
      }
      const enrRows = Array.from(enrMap.values());
      console.log(`[machines-import] STEP 7: enrRows=${enrRows.length}`);

      // Reaktivering-tælling sprang over (header-grænse).
      let enrichmentReactivated = 0;

      const { count: enrCountBefore } = await supabaseAdmin
        .from("machine_enrichment" as any)
        .select("serienr", { count: "exact", head: true });
      console.log(`[machines-import] STEP 9: enr count FØR=${enrCountBefore ?? 0}`);

      let enrichmentUpserted = 0;
      for (let i = 0; i < enrRows.length; i += CHUNK) {
        const slice = enrRows.slice(i, i + CHUNK);
        const { error, status, statusText } = await supabaseAdmin
          .from("machine_enrichment" as any)
          .upsert(slice, { onConflict: "serienr" });
        if (error) {
          const msg = `enrichment upsert chunk ${i}: ${error.message} (code=${(error as any).code}, details=${(error as any).details}, hint=${(error as any).hint}, http=${status} ${statusText})`;
          console.error("[machines-import]", msg, "førsterække:", JSON.stringify(slice[0]));
          throw new Error(msg);
        }
        enrichmentUpserted += slice.length;
      }
      console.log(`[machines-import] STEP 10 DONE: enrichmentUpserted=${enrichmentUpserted}`);

      const { count: enrCountAfter } = await supabaseAdmin
        .from("machine_enrichment" as any)
        .select("serienr", { count: "exact", head: true });
      console.log(`[machines-import] STEP 11: enr count EFTER=${enrCountAfter ?? 0}`);

      let enrichmentMarkedUdgaaet = 0;
      if (data.enrichmentRows.length > 0) {
        const { data: upd, error } = await supabaseAdmin
          .from("machine_enrichment" as any)
          .update({ record_status: "udgaaet", udgaaet_dato: importedAt })
          .or(`last_seen_import.is.null,last_seen_import.lt.${importedAt}`)
          .neq("record_status", "udgaaet")
          .select("serienr");
        if (error) throw new Error("enrichment udgået-mark: " + JSON.stringify(error));
        enrichmentMarkedUdgaaet = upd?.length ?? 0;
      }

      console.log(`[machines-import] FÆRDIG: machines=${machinesUpserted} enrichment=${enrichmentUpserted}`);
      return {
        machinesUpserted,
        enrichmentUpserted,
        machineRowsParsed: data.machineRows.length,
        enrichmentRowsParsed: data.enrichmentRows.length,
        machinesActiveBefore,
        enrichmentActiveBefore,
        machinesMarkedUdgaaet,
        enrichmentMarkedUdgaaet,
        machinesReactivated,
        enrichmentReactivated,
        importedAt,
      };
    } catch (e: any) {
      console.error("[machines-import] TOP-LEVEL FEJL:", e?.message ?? String(e), "\nSTACK:", e?.stack ?? "(ingen)");
      throw e;
    }
  });
