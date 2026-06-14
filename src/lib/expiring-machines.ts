import { supabase } from "@/integrations/supabase/client";

export type ExpiringMachineDetail = {
  companyId: string;
  companyName: string;
  serienr: string;
  machineType: string | null;
  subLocation: string | null;
  agreementType: string | null;
  locationId: string;
  locationAddress: string | null;
  locationZip: string | null;
  locationCity: string | null;
  date: string;
  type: "binding" | "service";
};

export type ExpiringCustomerGroup = {
  companyId: string;
  companyName: string;
  earliestDate: string;
  machines: ExpiringMachineDetail[];
};

export async function fetchExpiringMachines(
  userId: string,
  isAdmin: boolean,
): Promise<ExpiringCustomerGroup[]> {
  const todayS = new Date().toISOString().slice(0, 10);
  const in90D = new Date();
  in90D.setDate(in90D.getDate() + 90);
  const in90S = in90D.toISOString().slice(0, 10);

  // 1. Enrichment-rækker i vinduet
  const { data: enr, error: enrErr } = await (supabase as any)
    .from("machine_enrichment")
    .select("serienr, binding_ophor, handlingsdato")
    .eq("record_status", "aktiv")
    .or(
      `and(binding_ophor.gte.${todayS},binding_ophor.lte.${in90S}),and(handlingsdato.gte.${todayS},handlingsdato.lte.${in90S})`,
    );
  if (enrErr) throw enrErr;
  const enrRows = ((enr ?? []) as any[]).filter((e) => e.serienr);
  const serienrs = Array.from(new Set(enrRows.map((e) => String(e.serienr))));
  if (!serienrs.length) return [];

  const enrBySerial = new Map<string, any>();
  enrRows.forEach((e) => enrBySerial.set(String(e.serienr), e));

  // 2. location_equipment_units for disse serienr (chunked IN) — giver os
  //    lokation + maskintype + aftaletype direkte.
  const units: any[] = [];
  const CHUNK = 500;
  for (let i = 0; i < serienrs.length; i += CHUNK) {
    const slice = serienrs.slice(i, i + CHUNK);
    const { data, error } = await (supabase as any)
      .from("location_equipment_units")
      .select(
        "serial_no, machine_type, sub_location, agreement_type, location_id",
      )
      .eq("is_filter", false)
      .in("serial_no", slice);
    if (error) throw error;
    units.push(...(data ?? []));
  }
  if (!units.length) return [];

  // 3. Locations → company_id + adresse
  const locationIds = Array.from(
    new Set(units.map((u) => u.location_id).filter(Boolean)),
  );
  if (!locationIds.length) return [];

  const locations: any[] = [];
  for (let i = 0; i < locationIds.length; i += CHUNK) {
    const slice = locationIds.slice(i, i + CHUNK);
    const { data, error } = await (supabase as any)
      .from("locations")
      .select("id, company_id, address, zip, city")
      .in("id", slice);
    if (error) throw error;
    locations.push(...(data ?? []));
  }
  const locById = new Map<string, any>();
  locations.forEach((l) => locById.set(l.id, l));

  // 4. Tilladte virksomheder
  const companyIds = Array.from(
    new Set(locations.map((l) => l.company_id).filter(Boolean)),
  );
  if (!companyIds.length) return [];

  let compQ = supabase
    .from("companies")
    .select("id, name")
    .in("id", companyIds);
  if (!isAdmin) compQ = compQ.eq("assigned_to", userId);
  const { data: companies, error: cErr } = await compQ;
  if (cErr) throw cErr;
  const compById = new Map<string, { id: string; name: string }>();
  (companies ?? []).forEach((c: any) =>
    compById.set(c.id, { id: c.id, name: c.name }),
  );
  if (compById.size === 0) return [];

  // 5. Byg detalje-rækker pr. maskine — bedste (nærmeste) udløbsdato i vinduet
  const details: ExpiringMachineDetail[] = [];
  for (const u of units) {
    const loc = locById.get(u.location_id);
    if (!loc) continue;
    const comp = compById.get(loc.company_id);
    if (!comp) continue;
    const e = enrBySerial.get(String(u.serial_no));
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

    details.push({
      companyId: comp.id,
      companyName: comp.name,
      serienr: String(u.serial_no),
      machineType: u.machine_type ?? null,
      subLocation: u.sub_location ?? null,
      agreementType: u.agreement_type ?? null,
      locationId: loc.id,
      locationAddress: loc.address ?? null,
      locationZip: loc.zip ?? null,
      locationCity: loc.city ?? null,
      date: best.date,
      type: best.type,
    });
  }

  // 6. Gruppér pr. virksomhed
  const byCompany = new Map<string, ExpiringCustomerGroup>();
  for (const d of details) {
    const g = byCompany.get(d.companyId);
    if (!g) {
      byCompany.set(d.companyId, {
        companyId: d.companyId,
        companyName: d.companyName,
        earliestDate: d.date,
        machines: [d],
      });
    } else {
      g.machines.push(d);
      if (d.date < g.earliestDate) g.earliestDate = d.date;
    }
  }
  // Sortér maskiner inde i hver gruppe efter dato
  byCompany.forEach((g) =>
    g.machines.sort((a, b) => a.date.localeCompare(b.date)),
  );
  return Array.from(byCompany.values()).sort((a, b) =>
    a.earliestDate.localeCompare(b.earliestDate),
  );
}
