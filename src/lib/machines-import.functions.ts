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

    // ---- Machines: hash + dup_index ----
    const dupCounter = new Map<string, number>();
    const machineRows: any[] = [];
    for (const r of data.machineRows) {
      const ordrenr = t(r.ordrenr);
      const varenr = t(r.varenr);
      const beskrivelse = t(r.beskrivelse);
      const serienr = t(r.serienr);
      const udlanstype = t(r.udlanstype);
      // Spring tomme/uægte rækker over (intet at identificere på)
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
        kobt_dato: r.kobt_dato || null,
        lease_leje_dato: r.lease_leje_dato || null,
        adresselinje2: t(r.adresselinje2) || null,
        aendret_dato: r.aendret_dato || null,
        status: t(r.status) || null,
        taellerstand: r.taellerstand ?? null,
        record_status: "aktiv",
        last_seen_import: importedAt,
        udgaaet_dato: null,
      });
    }



    // ---- Diagnostik: aktive før import ----
    let machinesActiveBefore = 0;
    let enrichmentActiveBefore = 0;
    if (data.machineRows.length > 0) {
      const { count } = await supabaseAdmin
        .from("machines" as any)
        .select("id", { count: "exact", head: true })
        .eq("record_status", "aktiv");
      machinesActiveBefore = count ?? 0;
    }
    if (data.enrichmentRows.length > 0) {
      const { count } = await supabaseAdmin
        .from("machine_enrichment" as any)
        .select("serienr", { count: "exact", head: true })
        .eq("record_status", "aktiv");
      enrichmentActiveBefore = count ?? 0;
    }

    // ---- Tæl reaktiverede maskiner (var udgået, kommer tilbage i fil) ----
    let machinesReactivated = 0;
    if (machineRows.length > 0) {
      const ids = machineRows.map((m) => m.id);
      const CHUNK_IN = 500;
      for (let i = 0; i < ids.length; i += CHUNK_IN) {
        const slice = ids.slice(i, i + CHUNK_IN);
        const { count } = await supabaseAdmin
          .from("machines" as any)
          .select("id", { count: "exact", head: true })
          .in("id", slice)
          .eq("record_status", "udgaaet");
        machinesReactivated += count ?? 0;
      }
    }

    const CHUNK = 1000;
    let machinesUpserted = 0;
    for (let i = 0; i < machineRows.length; i += CHUNK) {
      const slice = machineRows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("machines" as any)
        .upsert(slice, { onConflict: "id" });
      if (error) throw new Error("machines upsert: " + error.message);
      machinesUpserted += slice.length;
    }

    // ---- Markér manglende maskiner som udgået ----
    let machinesMarkedUdgaaet = 0;
    if (data.machineRows.length > 0) {
      const { data: upd, error } = await supabaseAdmin
        .from("machines" as any)
        .update({ record_status: "udgaaet", udgaaet_dato: importedAt })
        .or(`last_seen_import.is.null,last_seen_import.lt.${importedAt}`)
        .neq("record_status", "udgaaet")
        .select("id");
      if (error) throw new Error("machines udgået-mark: " + error.message);
      machinesMarkedUdgaaet = upd?.length ?? 0;
    }

    // ---- Enrichment: dedupe på serienr (sidste vinder) ----
    const enrMap = new Map<string, any>();
    for (const r of data.enrichmentRows) {
      const serienr = t(r.serienr);
      if (!serienr) continue;
      enrMap.set(serienr, {
        serienr,
        taelleraflaesning: r.taelleraflaesning || null,
        binding_ophor: r.binding_ophor || null,
        beregnet_slutdato: r.beregnet_slutdato || null,
        handlingsdato: r.handlingsdato || null,
        handlingsdato_raw: r.handlingsdato_raw || null,
        data: r.data ?? null,
        record_status: "aktiv",
        last_seen_import: importedAt,
        udgaaet_dato: null,
      });
    }
    const enrRows = Array.from(enrMap.values());

    let enrichmentReactivated = 0;
    if (enrRows.length > 0) {
      const serienrs = enrRows.map((e) => e.serienr);
      const CHUNK_IN = 500;
      for (let i = 0; i < serienrs.length; i += CHUNK_IN) {
        const slice = serienrs.slice(i, i + CHUNK_IN);
        const { count } = await supabaseAdmin
          .from("machine_enrichment" as any)
          .select("serienr", { count: "exact", head: true })
          .in("serienr", slice)
          .eq("record_status", "udgaaet");
        enrichmentReactivated += count ?? 0;
      }
    }

    let enrichmentUpserted = 0;
    for (let i = 0; i < enrRows.length; i += CHUNK) {
      const slice = enrRows.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("machine_enrichment" as any)
        .upsert(slice, { onConflict: "serienr" });
      if (error) throw new Error("machine_enrichment upsert: " + error.message);
      enrichmentUpserted += slice.length;
    }

    let enrichmentMarkedUdgaaet = 0;
    if (data.enrichmentRows.length > 0) {
      const { data: upd, error } = await supabaseAdmin
        .from("machine_enrichment" as any)
        .update({ record_status: "udgaaet", udgaaet_dato: importedAt })
        .or(`last_seen_import.is.null,last_seen_import.lt.${importedAt}`)
        .neq("record_status", "udgaaet")
        .select("serienr");
      if (error) throw new Error("machine_enrichment udgået-mark: " + error.message);
      enrichmentMarkedUdgaaet = upd?.length ?? 0;
    }

    console.log(
      `[machines-import] master-spejling machines: aktivFør=${machinesActiveBefore} iFil=${data.machineRows.length} upsertet=${machinesUpserted} nyUdgået=${machinesMarkedUdgaaet} reaktiveret=${machinesReactivated}`,
    );
    console.log(
      `[machines-import] master-spejling enrichment: aktivFør=${enrichmentActiveBefore} iFil=${data.enrichmentRows.length} upsertet=${enrichmentUpserted} nyUdgået=${enrichmentMarkedUdgaaet} reaktiveret=${enrichmentReactivated}`,
    );

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
  });
