import { supabase } from "@/integrations/supabase/client";

export type ExpiringMachineRow = {
  companyId: string;
  companyName: string;
  date: string;
  type: "binding" | "service";
  count: number;
};

export async function fetchExpiringMachines(
  userId: string,
  isAdmin: boolean,
): Promise<ExpiringMachineRow[]> {
  const todayS = new Date().toISOString().slice(0, 10);
  const in90D = new Date();
  in90D.setDate(in90D.getDate() + 90);
  const in90S = in90D.toISOString().slice(0, 10);

  const { data: enr, error: enrErr } = await (supabase as any)
    .from("machine_enrichment")
    .select("serienr, binding_ophor, handlingsdato")
    .eq("record_status", "aktiv")
    .or(
      `and(binding_ophor.gte.${todayS},binding_ophor.lte.${in90S}),and(handlingsdato.gte.${todayS},handlingsdato.lte.${in90S})`,
    );
  if (enrErr) throw enrErr;
  const serienrs = Array.from(
    new Set(((enr ?? []) as any[]).map((e) => e.serienr).filter(Boolean)),
  );
  if (!serienrs.length) return [];

  const machines: any[] = [];
  const CHUNK = 500;
  for (let i = 0; i < serienrs.length; i += CHUNK) {
    const slice = serienrs.slice(i, i + CHUNK);
    const { data, error } = await (supabase as any)
      .from("machines")
      .select("serienr, fak_kundenr")
      .eq("record_status", "aktiv")
      .in("serienr", slice);
    if (error) throw error;
    machines.push(...(data ?? []));
  }
  if (!machines.length) return [];

  const kundenrs = Array.from(
    new Set(machines.map((m) => m.fak_kundenr).filter(Boolean) as string[]),
  );
  if (!kundenrs.length) return [];

  let compQ = supabase
    .from("companies")
    .select("id, name, visma_id")
    .in("visma_id", kundenrs);
  if (!isAdmin) compQ = compQ.eq("assigned_to", userId);
  const { data: companies, error: cErr } = await compQ;
  if (cErr) throw cErr;
  const compByVisma = new Map<string, { id: string; name: string }>();
  (companies ?? []).forEach((c: any) =>
    compByVisma.set(c.visma_id, { id: c.id, name: c.name }),
  );
  if (compByVisma.size === 0) return [];

  const enrBySerienr = new Map<string, any>();
  ((enr ?? []) as any[]).forEach((e) => enrBySerienr.set(e.serienr, e));

  type Earliest = {
    companyId: string;
    companyName: string;
    date: string;
    type: "binding" | "service";
  };
  const byCompany = new Map<string, { earliest: Earliest; count: number }>();

  for (const m of machines) {
    const comp = m.fak_kundenr ? compByVisma.get(m.fak_kundenr) : null;
    if (!comp) continue;
    const e = enrBySerienr.get(m.serienr);
    if (!e) continue;

    const cands: { date: string; type: "binding" | "service" }[] = [];
    if (e.binding_ophor && e.binding_ophor >= todayS && e.binding_ophor <= in90S) {
      cands.push({ date: e.binding_ophor, type: "binding" });
    }
    if (e.handlingsdato && e.handlingsdato >= todayS && e.handlingsdato <= in90S) {
      cands.push({ date: e.handlingsdato, type: "service" });
    }
    if (!cands.length) continue;
    cands.sort((a, b) => a.date.localeCompare(b.date));
    const best = cands[0];

    const existing = byCompany.get(comp.id);
    if (!existing) {
      byCompany.set(comp.id, {
        earliest: { companyId: comp.id, companyName: comp.name, ...best },
        count: 1,
      });
    } else {
      existing.count++;
      if (best.date < existing.earliest.date) {
        existing.earliest = { companyId: comp.id, companyName: comp.name, ...best };
      }
    }
  }

  return Array.from(byCompany.values())
    .map(({ earliest, count }) => ({ ...earliest, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
