import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSalesForCompany } from "@/lib/sales.functions";
import { SuppliedViaBanner } from "./supplied-via-banner";
import { KundeStatusLinje } from "./kunde-status-linje";
import { SalesFactsStrip } from "./sales-facts-strip";
import { ConsumableKgChart } from "./consumable-kg-chart";
import { Card } from "@/components/ui/card";
import { Loader2, BarChart3 } from "lucide-react";

export function CompanySalesTab({
  companyId,
  locationIds,
}: {
  companyId: string;
  totalLocations?: number;
  locationIds?: string[];
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
  const hasActiveEquipment = !!q.data?.hasActiveEquipment;

  if (!rows.length && !hasActiveEquipment) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Ingen salgsdata registreret for denne virksomhed endnu.</p>
        <p className="text-xs mt-1">Importér fakturajournal under Admin → Import → Faktura/salgsdata.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <SuppliedViaBanner companyId={companyId} />
      <KundeStatusLinje rows={rows} />
      <SalesFactsStrip rows={rows} isAdmin={isAdmin} />
      <ConsumableKgChart rows={rows} months={18} />
    </div>
  );
}
