import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSalesForCompany } from "@/lib/sales.functions";
import { SalesKpiStrip } from "./sales-kpi-strip";
import { CategoryBars } from "./category-bars";
import { RevenueSparkline } from "./revenue-sparkline";
import { SalesSignalBox } from "./sales-signal-box";
import { Card } from "@/components/ui/card";
import { Loader2, BarChart3 } from "lucide-react";
import { monthsAgo, filterByPeriod, sumRows } from "@/lib/sales-utils";

export function CompanySalesTab({
  companyId,
  totalLocations,
  locationIds,
}: {
  companyId: string;
  totalLocations: number;
  locationIds: string[];
}) {
  const fetchFn = useServerFn(getSalesForCompany);
  const q = useQuery({
    queryKey: ["sales-company", companyId],
    queryFn: () => fetchFn({ data: { companyId } }),
  });

  if (q.isLoading) {
    return (
      <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Henter salgsdata…
      </Card>
    );
  }
  if (q.error) {
    return <Card className="p-5 text-sm text-destructive">Kunne ikke hente salgsdata.</Card>;
  }
  const rows = q.data?.rows ?? [];
  const isAdmin = !!q.data?.isAdmin;

  if (!rows.length) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Ingen salgsdata registreret for denne virksomhed endnu.</p>
        <p className="text-xs mt-1">Importér fakturajournal under Admin → Import → Faktura/salgsdata.</p>
      </Card>
    );
  }

  // Active locations: those with revenue in last 6 months
  const sixMo = monthsAgo(5);
  const future = "9999-12-31";
  const activeLocIds = new Set<string>();
  filterByPeriod(rows, sixMo, future).forEach((r) => {
    if (r.location_id && (Number(r.revenue) || 0) > 0) activeLocIds.add(r.location_id);
  });
  // Only count locations that we know belong to this company
  const knownActive = locationIds.length
    ? locationIds.filter((id) => activeLocIds.has(id)).length
    : activeLocIds.size;

  return (
    <div className="space-y-4">
      <SalesKpiStrip
        rows={rows}
        isAdmin={isAdmin}
        locationsTotal={totalLocations}
        locationsActive={knownActive}
      />
      <SalesSignalBox rows={rows} />
      <div className="grid gap-4 md:grid-cols-2">
        <CategoryBars rows={rows} companyId={companyId} />
        <RevenueSparkline rows={rows} />
      </div>
    </div>
  );
}
