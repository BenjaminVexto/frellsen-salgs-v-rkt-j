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
import { fmtKg, fmtKr, isConsumableGroup, type SalesMonthlyRow } from "@/lib/sales-utils";
import { getMonthlyConsumableProducts } from "@/lib/sales.functions";

function serie(rows: SalesMonthlyRow[], months: number) {
  const out: { period: string; label: string; kg: number }[] = [];
  const now = new Date();
  // Kun hele måneder — den igangværende måned indgår ikke.
  for (let i = months; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    out.push({
      period,
      label: d.toLocaleDateString("da-DK", { month: "short" }),
      kg: 0,
    });
  }
  const idx = new Map(out.map((o, i) => [o.period, i]));
  for (const r of rows) {
    if (!isConsumableGroup(r.product_group_1)) continue;
    const i = idx.get(r.period);
    if (i != null) out[i].kg += Number(r.weight_kg) || 0;
  }
  return out;
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + "T00:00:00Z");
  return d.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
}

export function ConsumableKgChart({
  rows,
  months = 18,
  locationIds,
}: {
  rows: SalesMonthlyRow[];
  months?: number;
  locationIds?: string[];
}) {
  const data = serie(rows, months);
  const max = Math.max(1, ...data.map((d) => d.kg));
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const clickable = !!locationIds && locationIds.length > 0;

  const fetchFn = useServerFn(getMonthlyConsumableProducts);
  const varerQ = useQuery({
    queryKey: [
      "monthly-consumable-products",
      openPeriod,
      locationIds?.slice().sort().join(","),
    ],
    queryFn: () =>
      fetchFn({ data: { locationIds: locationIds ?? [], period: openPeriod! } }),
    enabled: !!openPeriod && clickable,
  });
  const varer = varerQ.data ?? [];
  const harKg = varer.some((v) => v.weightKg > 0);

  return (
    <>
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Kg forbrugsvarer pr. måned</h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          Seneste {months} hele måneder. Tomme måneder er normalt hos kunder, der bestiller i partier.
          {clickable ? " Klik på en søjle for at se varelinjerne." : ""}
        </p>
        <div className="flex gap-1.5 h-36">
          {data.map((d) => (
            <div key={d.period} className="flex-1 flex flex-col items-center gap-1 h-full">
              <div className="flex-1 w-full flex items-end min-h-0">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && setOpenPeriod(d.period)}
                  className={`w-full bg-primary/60 rounded-t transition-colors ${
                    clickable ? "cursor-pointer hover:bg-primary" : "cursor-default"
                  }`}
                  style={{ height: `${(d.kg / max) * 100}%`, minHeight: d.kg > 0 ? 2 : 0 }}
                  title={`${d.label}: ${fmtKg(d.kg, 1)}${clickable ? " — klik for varelinjer" : ""}`}
                  aria-label={`${d.label}: ${fmtKg(d.kg, 1)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Den igangværende måned indgår ikke.
        </p>
      </Card>

      <Dialog open={!!openPeriod} onOpenChange={(o) => !o && setOpenPeriod(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Forbrugsvarer · {openPeriod ? formatPeriodLabel(openPeriod) : ""}
            </DialogTitle>
          </DialogHeader>
          {varerQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Henter…
            </div>
          ) : varerQ.error ? (
            <p className="text-sm text-destructive py-4">Kunne ikke hente varelinjer.</p>
          ) : varer.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Ingen forbrugsvarer købt i denne måned.
            </p>
          ) : (
            <>
              <ul className="divide-y text-sm max-h-[60vh] overflow-y-auto">
                {varer.map((v) => (
                  <li key={v.varenr} className="py-2 flex items-baseline justify-between gap-3">
                    <span className="truncate">
                      <span className="font-medium">{v.description ?? v.varenr}</span>
                      {v.quantity > 0 && (
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          · {Math.round(v.quantity)} stk.
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-right">
                      {v.weightKg > 0 && (
                        <span className="font-medium">{fmtKg(v.weightKg, 1)}</span>
                      )}
                      <span className="text-muted-foreground text-xs">
                        {v.weightKg > 0 ? " · " : ""}
                        {fmtKr(v.revenue)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {!harKg && (
                <p className="text-[11px] text-muted-foreground">
                  Kilo pr. varelinje udfyldes ved næste fakturaimport — indtil da vises kun antal og kroner.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
