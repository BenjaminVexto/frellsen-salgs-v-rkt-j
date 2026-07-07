import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { fmtKr, monthlyRevenueSeries, type SalesMonthlyRow } from "@/lib/sales-utils";
import { getMonthlyTopProducts } from "@/lib/sales.functions";

function formatPeriodLabel(period: string): string {
  const d = new Date(period + "T00:00:00Z");
  return d.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
}

export function RevenueSparkline({
  rows,
  title = "Omsætning pr. måned (12 mdr.)",
  locationIds,
}: {
  rows: SalesMonthlyRow[];
  title?: string;
  locationIds?: string[];
}) {
  const series = monthlyRevenueSeries(rows, 12);
  const max = Math.max(1, ...series.map((s) => s.revenue));
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const clickable = !!locationIds && locationIds.length > 0;

  const fetchTopFn = useServerFn(getMonthlyTopProducts);
  const topQ = useQuery({
    queryKey: ["monthly-top-products", openPeriod, locationIds?.slice().sort().join(",")],
    queryFn: () =>
      fetchTopFn({ data: { locationIds: locationIds ?? [], period: openPeriod! } }),
    enabled: !!openPeriod && clickable,
  });

  return (
    <>
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
        <div className="flex gap-1.5 h-32">
          {series.map((s, i) => {
            const h = max > 0 ? (s.revenue / max) * 100 : 0;
            const canClick = clickable && s.revenue > 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full">
                <div className="flex-1 w-full flex items-end min-h-0">
                  <button
                    type="button"
                    disabled={!canClick}
                    onClick={() => canClick && setOpenPeriod(s.period)}
                    className={`w-full bg-primary/60 rounded-t transition-colors ${
                      canClick ? "cursor-pointer hover:bg-primary" : "cursor-default"
                    }`}
                    style={{ height: `${h}%`, minHeight: s.revenue > 0 ? 2 : 0 }}
                    title={`${s.label}: ${fmtKr(s.revenue)}${canClick ? " — klik for top-varer" : ""}`}
                    aria-label={`${s.label}: ${fmtKr(s.revenue)}`}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Dialog open={!!openPeriod} onOpenChange={(o) => !o && setOpenPeriod(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Top-varer · {openPeriod ? formatPeriodLabel(openPeriod) : ""}
            </DialogTitle>
          </DialogHeader>
          {topQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Henter…
            </div>
          ) : topQ.error ? (
            <p className="text-sm text-destructive py-4">Kunne ikke hente top-varer.</p>
          ) : (topQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Ingen vare-detaljer registreret for denne måned. Reimportér fakturajournalen for at udfylde måneds-top-varer.
            </p>
          ) : (
            <ul className="divide-y text-sm max-h-[60vh] overflow-y-auto">
              {(topQ.data ?? []).map((p) => (
                <li
                  key={p.varenr}
                  className="py-2 flex items-baseline justify-between gap-3"
                >
                  <span className="truncate">
                    <span className="font-medium">{p.description ?? p.varenr}</span>
                    {p.quantity > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · {Math.round(p.quantity)} stk.
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums shrink-0">{fmtKr(p.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
