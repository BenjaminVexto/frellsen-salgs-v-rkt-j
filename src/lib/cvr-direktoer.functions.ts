import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kraevIntern } from "@/lib/kraev-intern";

const TRIN = 200;

async function kraevAdmin(sb: any, userId: string) {
  const { data } = await sb.rpc("is_admin", { _user_id: userId });
  if (!data) throw new Error("Kun administratorer");
}

/** Opretter et batch-job, der henter direktør fra CVR. Listens virksomheder (hvis angivet) køres først. */
export const startDirektoerJob = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((i: unknown) =>
    z.object({
      company_ids: z.array(z.string().uuid()).max(50000).optional(),
      alle_cvr_emner: z.boolean().optional(),
      foerst_liste_id: z.string().uuid().optional(),
      beskrivelse: z.string().max(200).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await kraevAdmin(context.supabase, context.userId);
    const { hentAlle } = await import("@/lib/hent-alle");
    const ids: string[] = [];
    const set = new Set<string>();
    const add = (x: string) => { if (!set.has(x)) { set.add(x); ids.push(x); } };
    if (data.foerst_liste_id) {
      const a = await hentAlle<any>((f, t) =>
        context.supabase.from("contact_list_assignments").select("id, company_id").eq("contact_list_id", data.foerst_liste_id!).order("id").range(f, t) as any);
      a.forEach((r) => add(r.company_id));
    }
    (data.company_ids ?? []).forEach(add);
    if (data.alle_cvr_emner) {
      const c = await hentAlle<any>((f, t) =>
        context.supabase.from("companies").select("id").eq("customer_type", "nyt_emne").contains("sources", ["cvr"]).order("id").range(f, t) as any);
      c.forEach((r) => add(r.id));
    }
    if (!ids.length) return { job_id: null as string | null, total: 0 };
    const { data: job, error } = await (context.supabase as any)
      .from("cvr_direktoer_job")
      .insert({ company_ids: ids, created_by: context.userId, beskrivelse: data.beskrivelse ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { job_id: job.id as string, total: ids.length };
  });

/** Kører næste trin (200 virksomheder) af et job og gemmer fremdriften. */
export const koerDirektoerTrin = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((i: unknown) => z.object({ job_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await kraevAdmin(context.supabase, context.userId);
    const sb = context.supabase as any;
    const { data: job, error } = await sb.from("cvr_direktoer_job").select("*").eq("id", data.job_id).single();
    if (error) throw new Error(error.message);
    if (job.status !== "koerer") return job;
    const user = process.env["CVR_USERNAME"];
    const pass = process.env["CVR_PASSWORD"];
    if (!user || !pass) throw new Error("CVR-adgang mangler");
    const slice: string[] = job.company_ids.slice(job.naeste, job.naeste + TRIN);
    const { berigDirektoerer } = await import("@/lib/cvr-direktoer");
    try {
      const r = await berigDirektoerer(sb, slice, { user, pass });
      const naeste = job.naeste + slice.length;
      const upd = {
        naeste,
        fundet: job.fundet + r.fundet,
        oprettet: job.oprettet + r.oprettet,
        status: naeste >= job.company_ids.length ? "faerdig" : "koerer",
        opdateret_at: new Date().toISOString(),
      };
      await sb.from("cvr_direktoer_job").update(upd).eq("id", job.id);
      return { ...job, ...upd };
    } catch (e: any) {
      await sb.from("cvr_direktoer_job").update({ fejl: String(e?.message ?? e).slice(0, 500), opdateret_at: new Date().toISOString() }).eq("id", job.id);
      throw e;
    }
  });
