import { Card } from "@/components/ui/card";
import { AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { beregnKundeStatus } from "@/lib/kunde-status";
import type { SalesMonthlyRow } from "@/lib/sales-utils";

export function KundeStatusLinje({ rows }: { rows: SalesMonthlyRow[] }) {
  const status = beregnKundeStatus(rows);

  const tone =
    status.tone === "rod"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : status.tone === "gul"
        ? "border-warning/50 bg-warning/10 text-warning-foreground"
        : "border-border bg-muted/40 text-foreground";

  const Icon =
    status.tone === "rod" ? AlertTriangle : status.tone === "gul" ? TrendingDown : Clock;

  return (
    <Card className={`p-4 border ${tone}`}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{status.overskrift}</p>
          <p className="text-sm mt-0.5">{status.tekst}</p>
        </div>
      </div>
    </Card>
  );
}
