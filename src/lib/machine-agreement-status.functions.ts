import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MachineAgreementStatusValue =
  | "i_gang"
  | "kontaktet"
  | "afventer_kunde"
  | "fornyet"
  | "tabt";

export type MachineAgreementStatusRow = {
  serienr: string;
  status: MachineAgreementStatusValue;
  note: string | null;
  updated_by: string;
  updated_at: string;
};

export const getMachineAgreementStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serienrs: string[] }) => input)
  .handler(async ({ data, context }) => {
    if (!data.serienrs.length) return { statuses: [] as MachineAgreementStatusRow[] };
    const CHUNK = 500;
    const out: MachineAgreementStatusRow[] = [];
    for (let i = 0; i < data.serienrs.length; i += CHUNK) {
      const slice = data.serienrs.slice(i, i + CHUNK);
      const { data: rows, error } = await context.supabase
        .from("machine_agreement_status")
        .select("serienr, status, note, updated_by, updated_at")
        .in("serienr", slice);
      if (error) throw error;
      out.push(...((rows ?? []) as MachineAgreementStatusRow[]));
    }
    return { statuses: out };
  });

export const setMachineAgreementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      serienr: string;
      locationId: string | null;
      companyId: string;
      status: MachineAgreementStatusValue;
      note?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("machine_agreement_status")
      .upsert(
        {
          serienr: data.serienr,
          location_id: data.locationId,
          company_id: data.companyId,
          status: data.status,
          note: data.note ?? null,
          updated_by: context.userId,
        },
        { onConflict: "serienr" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const clearMachineAgreementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serienr: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("machine_agreement_status")
      .delete()
      .eq("serienr", data.serienr);
    if (error) throw error;
    return { ok: true };
  });

export const MACHINE_AGREEMENT_STATUS_LABELS: Record<MachineAgreementStatusValue, string> = {
  i_gang: "I gang",
  kontaktet: "Kontaktet",
  afventer_kunde: "Afventer kunde",
  fornyet: "Fornyet",
  tabt: "Tabt",
};

export const MACHINE_AGREEMENT_STATUS_TONE: Record<MachineAgreementStatusValue, string> = {
  i_gang: "bg-blue-100 text-blue-900 border-blue-200",
  kontaktet: "bg-purple-100 text-purple-900 border-purple-200",
  afventer_kunde: "bg-amber-100 text-amber-900 border-amber-300",
  fornyet: "bg-emerald-100 text-emerald-900 border-emerald-200",
  tabt: "bg-slate-200 text-slate-800 border-slate-300",
};
