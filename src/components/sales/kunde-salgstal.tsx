import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

/** Fast talrække øverst på Oversigt. Egne lokationer, når sælgeren har nogen, med omskifter til hele virksomheden. */
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
  const [hele, setHele] = useState(false);
  const visEgne = harEgne && !hele;
  const compFn = useServerFn(getSalesForCompany);
  const lokFn = useServerFn(getSalesForLocations);

  const salgQ = useQuery({
    queryKey: visEgne ? ["sales-locations", egneLokIds] : ["sales-company", companyId],
    queryFn: async () =>
      visEgne ? lokFn({ data: { locationIds: egneLokIds } }) : compFn({ data: { companyId } }),
  });
  const lokIds = visEgne ? egneLokIds : alleLokIds;
  const maskQ = useQuery({
    queryKey: ["kunde-salgstal-maskiner", companyId, lokIds],
    enabled: lokIds.length > 0,
    queryFn: async () => {
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
    },
  });

  const tal = useMemo(() => {
    const rows = salgQ.data?.rows ?? [];
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
  }, [salgQ.data]);

  const dato = (iso: string) =>
    new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Card className="p-4">
      {harEgne && (
        <div className="flex items-center justify-between gap-2 mb-3 text-xs">
          <span className="text-muted-foreground">
            {visEgne ? `Dine ${egneLokIds.length} af ${alleLokIds.length} lokationer` : "Hele virksomheden"}
          </span>
          <div className="flex items-center gap-2">
            <Switch id="hele-virk" checked={hele} onCheckedChange={setHele} />
            <Label htmlFor="hele-virk" className="text-xs">Hele virksomheden</Label>
          </div>
        </div>
      )}
      {salgQ.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter salgstal…
        </div>
      ) : salgQ.error ? (
        <p className="text-sm text-destructive">Kunne ikke hente salgstal.</p>
      ) : (
        <div className="grid grid-cols-2 2xl:grid-cols-3 gap-x-4 gap-y-3">
          <Tal label="Omsætning 12 mdr." vaerdi={fmtKr(tal.oms12)} under={<p className="text-xs text-muted-foreground">Alle varer · 12 hele måneder</p>} />
          <Tal
            label="Forbrugsvarer mod 12 mdr. før"
            vaerdi={
              tal.udv == null ? (
                "—"
              ) : (
                <span className="inline-flex items-center gap-1">
                  {tal.udv >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  {`${tal.udv >= 0 ? "+" : ""}${Math.round(tal.udv * 100)} %`}
                </span>
              )
            }
          />
          {tal.db != null && <Tal label="DB på varer 12 mdr." vaerdi={fmtKr(tal.db)} />}
          <Tal
            label="Sidste forbrugskøb"
            vaerdi={tal.sidste ? dato(tal.sidste) : "—"}
            under={<KundeRytmeLinje companyId={companyId} />}
          />
          <Tal
            label="Aktive maskiner"
            vaerdi={maskQ.isLoading ? "…" : String(maskQ.data?.antal ?? 0)}
            under={
              maskQ.data?.foerste ? (
                <p className="text-xs text-muted-foreground">Første udløb {dato(maskQ.data.foerste)}</p>
              ) : null
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
