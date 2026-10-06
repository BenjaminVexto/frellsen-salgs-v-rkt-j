import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { getSalesForCompany, getSalesForLocations } from "@/lib/sales.functions";
import {
  currentMonthStart,
  filterByPeriod,
  fmtKr,
  isConsumableGroup,
  isMachineGroup,
  lastConsumablePurchasePeriod,
  monthsAgo,
  type SalesMonthlyRow,
} from "@/lib/sales-utils";
import { KundeRytmeLinje } from "@/components/kunde-rytme-linje";

const sum = (rows: SalesMonthlyRow[], f: (r: SalesMonthlyRow) => number) => rows.reduce((s, r) => s + f(r), 0);

type Tal5 = { oms12: number; udv: number | null; db: number | null; sidste: string | null };

function beregnTal(rows: SalesMonthlyRow[]): Tal5 {
  const nu = currentMonthStart();
  const fra12 = monthsAgo(12);
  const fra24 = monthsAgo(24);
  const s12 = filterByPeriod(rows, fra12, nu);
  const f12 = sum(s12.filter((r) => isConsumableGroup(r.product_group_1)), (r) => Number(r.revenue) || 0);
  const f24 = sum(
    filterByPeriod(rows, fra24, fra12).filter((r) => isConsumableGroup(r.product_group_1)),
    (r) => Number(r.revenue) || 0,
  );
  const varer = s12.filter((r) => !isMachineGroup(r.product_group_1));
  const harDb = varer.some((r) => r.contribution != null);
  return {
    oms12: sum(s12, (r) => Number(r.revenue) || 0),
    udv: f24 > 0 ? (f12 - f24) / f24 : null,
    db: harDb ? sum(varer, (r) => Number(r.contribution) || 0) : null,
    sidste: lastConsumablePurchasePeriod(rows),
  };
}

async function hentMaskiner(lokIds: string[]) {
  const units: any[] = [];
  for (let i = 0; i < lokIds.length; i += 200) {
    const { data, error } = await supabase
      .from("location_equipment_units")
      .select("serial_no")
      .in("location_id", lokIds.slice(i, i + 200))
      .eq("is_filter", false);
    if (error) throw error;
    units.push(...(data ?? []));
  }
  const serials = Array.from(new Set(units.map((u) => String(u.serial_no ?? "").trim()).filter(Boolean)));
  let foerste: string | null = null;
  const idag = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < serials.length; i += 200) {
    const { data } = await (supabase as any)
      .from("machine_enrichment")
      .select("binding_ophor, beregnet_slutdato")
      .eq("record_status", "aktiv")
      .in("serienr", serials.slice(i, i + 200));
    for (const e of (data ?? []) as any[]) {
      const d = (e.binding_ophor ?? e.beregnet_slutdato ?? null) as string | null;
      if (d && d.slice(0, 10) >= idag && (!foerste || d < foerste)) foerste = d.slice(0, 10);
    }
  }
  return { antal: units.length, foerste };
}

const dato = (iso: string) =>
  new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
const udvTekst = (u: number | null) => (u == null ? "—" : `${u >= 0 ? "+" : ""}${Math.round(u * 100)} %`);

/**
 * Fast talrække øverst på Oversigt. Er brugeren sælger på nogle (ikke alle) af
 * kundens lokationer, vises sælgerens eget tal stort og hele virksomhedens tal under.
 */
export function KundeSalgstal({
  companyId,
  egneLokIds,
  alleLokIds,
}: {
  companyId: string;
  egneLokIds: string[];
  alleLokIds: string[];
}) {
  const harEgne = egneLokIds.length > 0 && egneLokIds.length < alleLokIds.length;
  const compFn = useServerFn(getSalesForCompany);
  const lokFn = useServerFn(getSalesForLocations);

  const heleQ = useQuery({
    queryKey: ["sales-company", companyId],
    queryFn: async () => compFn({ data: { companyId } }),
  });
  const egneQ = useQuery({
    queryKey: ["sales-locations", egneLokIds],
    enabled: harEgne,
    queryFn: async () => lokFn({ data: { locationIds: egneLokIds } }),
  });
  const maskHeleQ = useQuery({
    queryKey: ["kunde-salgstal-maskiner", companyId, alleLokIds],
    enabled: alleLokIds.length > 0,
    queryFn: () => hentMaskiner(alleLokIds),
  });
  const maskEgneQ = useQuery({
    queryKey: ["kunde-salgstal-maskiner", companyId, egneLokIds],
    enabled: harEgne,
    queryFn: () => hentMaskiner(egneLokIds),
  });

  const hele = useMemo(() => beregnTal(heleQ.data?.rows ?? []), [heleQ.data]);
  const egne = useMemo(() => beregnTal(egneQ.data?.rows ?? []), [egneQ.data]);
  const loading = heleQ.isLoading || (harEgne && egneQ.isLoading);
  const fejl = heleQ.error || (harEgne && egneQ.error);
  const hovedTal = harEgne ? egne : hele;
  const hovedMask = harEgne ? maskEgneQ : maskHeleQ;
  const under = (v: string) =>
    harEgne ? <p className="text-xs text-muted-foreground">Hele virksomheden: {v}</p> : null;

  return (
    <Card className="p-4">
      {harEgne && (
        <p className="text-xs text-muted-foreground mb-3">
          Dine {egneLokIds.length} af {alleLokIds.length} lokationer · alle varer · 12 hele måneder
        </p>
      )}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter salgstal…
        </div>
      ) : fejl ? (
        <p className="text-sm text-destructive">Kunne ikke hente salgstal.</p>
      ) : (
        <div className="grid grid-cols-2 2xl:grid-cols-3 gap-x-4 gap-y-3">
          <Tal
            label="Omsætning 12 mdr."
            vaerdi={fmtKr(hovedTal.oms12)}
            under={harEgne ? under(fmtKr(hele.oms12)) : <p className="text-xs text-muted-foreground">Alle varer · 12 hele måneder</p>}
          />
          <Tal
            label="Forbrugsvarer mod 12 mdr. før"
            vaerdi={
              hovedTal.udv == null ? (
                "—"
              ) : (
                <span className="inline-flex items-center gap-1">
                  {hovedTal.udv >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  {udvTekst(hovedTal.udv)}
                </span>
              )
            }
            under={under(udvTekst(hele.udv))}
          />
          {hovedTal.db != null && (
            <Tal label="DB på varer 12 mdr." vaerdi={fmtKr(hovedTal.db)} under={hele.db != null ? under(fmtKr(hele.db)) : null} />
          )}
          <Tal
            label="Sidste forbrugskøb"
            vaerdi={hovedTal.sidste ? dato(hovedTal.sidste) : "—"}
            under={
              <>
                {under(hele.sidste ? dato(hele.sidste) : "—")}
                <KundeRytmeLinje companyId={companyId} />
              </>
            }
          />
          <Tal
            label="Aktive maskiner"
            vaerdi={hovedMask.isLoading ? "…" : String(hovedMask.data?.antal ?? 0)}
            under={
              <>
                {hovedMask.data?.foerste ? (
                  <p className="text-xs text-muted-foreground">Første udløb {dato(hovedMask.data.foerste)}</p>
                ) : null}
                {under(maskHeleQ.isLoading ? "…" : String(maskHeleQ.data?.antal ?? 0))}
              </>
            }
          />
        </div>
      )}
    </Card>
  );
}

function Tal({ label, vaerdi, under }: { label: string; vaerdi: React.ReactNode; under?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground leading-tight">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5 break-words">{vaerdi}</div>
      {under}
    </div>
  );
}
