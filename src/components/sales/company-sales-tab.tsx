import { DataOpdateret } from "@/components/data-opdateret";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSalesForCompany, getSalesForLocations } from "@/lib/sales.functions";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SuppliedViaBanner } from "./supplied-via-banner";
import { KundeStatusLinje } from "./kunde-status-linje";
import { SalesFactsStrip } from "./sales-facts-strip";
import { ConsumableKgChart } from "./consumable-kg-chart";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, BarChart3 } from "lucide-react";

export function CompanySalesTab({
  companyId,
  locationIds,
  egneLokIds = [],
  skjulSignaler,
}: {
  /** Sælgerens egne lokationer — giver omskifteren "Dine lokationer / Hele virksomheden". */
  egneLokIds?: string[];
  companyId: string;
  totalLocations?: number;
  locationIds?: string[];
  /** Afløst debitorpost: statuslinje/advarsler giver ingen mening. */
  skjulSignaler?: boolean;
}) {
  const fetchFn = useServerFn(getSalesForCompany);
  const lokFn = useServerFn(getSalesForLocations);
  const alle = locationIds ?? [];
  const harEgne = egneLokIds.length > 0 && egneLokIds.length < alle.length;
  const [hele, setHele] = useState(false);
  const visEgne = harEgne && !hele;
  const q = useQuery({
    queryKey: visEgne ? ["sales-locations", egneLokIds] : ["sales-company", companyId],
    queryFn: async (): Promise<any> =>
      visEgne ? lokFn({ data: { locationIds: egneLokIds } }) : fetchFn({ data: { companyId } }),
  });

  const maskQ = useQuery({
    queryKey: ["company-maskiner-antal", companyId, visEgne ? egneLokIds : null],
    queryFn: async () => {
      let ids = egneLokIds;
      if (!visEgne) {
        const { data: locs } = await supabase.from("locations").select("id").eq("company_id", companyId);
        ids = (locs ?? []).map((l) => l.id);
      }
      if (!ids.length) return 0;
      const { count, error } = await supabase
        .from("location_equipment_units")
        .select("id", { count: "exact", head: true })
        .in("location_id", ids)
        .eq("is_filter", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const omskifter = harEgne ? (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">
        {visEgne ? `Dine ${egneLokIds.length} af ${alle.length} lokationer` : "Hele virksomheden"}
      </span>
      <div className="flex items-center gap-2">
        <Switch id="salg-hele-virk" checked={hele} onCheckedChange={setHele} />
        <Label htmlFor="salg-hele-virk" className="text-xs">Hele virksomheden</Label>
      </div>
    </div>
  ) : null;

  if (q.isLoading) {
    return (
      <div className="space-y-4">{omskifter}
      <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Henter salgsdata…
      </Card></div>
    );
  }
  if (q.error) {
    return <Card className="p-5 text-sm text-destructive">Kunne ikke hente salgsdata.</Card>;
  }
  const rows = q.data?.rows ?? [];
  const isAdmin = !!q.data?.isAdmin;
  const hasActiveEquipment = !!q.data?.hasActiveEquipment;

  if (!rows.length && !hasActiveEquipment) {
    return (
      <div className="space-y-4">{omskifter}
      <Card className="p-8 text-center text-muted-foreground">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Ingen salgsdata registreret for denne virksomhed endnu.</p>
        <p className="text-xs mt-1">Importér fakturajournal under Admin → Import → Faktura/salgsdata.</p>
      </Card></div>
    );
  }

  return (
    <div className="space-y-4">
      {omskifter}
      <DataOpdateret />
      <SuppliedViaBanner companyId={companyId} />
      {!skjulSignaler && <KundeStatusLinje rows={rows} />}
      <SalesFactsStrip rows={rows} isAdmin={isAdmin} antalMaskiner={maskQ.data ?? null} visEgne={visEgne} />
      <ConsumableKgChart
        rows={rows}
        months={12}
        locationIds={visEgne ? egneLokIds : locationIds}
        gruppeNavne={q.data?.gruppeNavne}
      />
    </div>
  );
}

