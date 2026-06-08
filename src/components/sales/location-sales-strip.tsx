import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSalesForLocation } from "@/lib/sales.functions";
import {
  fmtKr,
  fmtPct,
  daysSince,
  monthsAgo,
  filterByPeriod,
  sumRows,
  groupByCategory,
  lastPurchasePeriod,
} from "@/lib/sales-utils";
import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, TrendingUp } from "lucide-react";

export function LocationSalesStrip({ locationId, isAdmin }: { locationId: string; isAdmin: boolean }) {
  const fetchFn = useServerFn(getSalesForLocation);
  const q = useQuery({
    queryKey: ["sales-location", locationId],
    queryFn: () => fetchFn({ data: { locationId } }),
  });
  const [open, setOpen] = useState(false);

  if (q.isLoading) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Henter salgstal…
      </div>
    );
  }
  if (q.error || !q.data) return null;

  const rows = q.data.rows;
  const topProducts = q.data.topProducts;
  if (!rows.length && !topProducts.length) return null;

  const nextMonth = (() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  })();
  const last12 = filterByPeriod(rows, monthsAgo(11), nextMonth);
  const sum = sumRows(last12);
  const lastP = lastPurchasePeriod(rows);
  const cats = groupByCategory(last12, 1);
  const top = cats[0]?.label ?? "—";
  const dg = isAdmin && sum.contribution != null && sum.revenue > 0 ? sum.contribution / sum.revenue : null;

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" /> Salg på denne lokation
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Køb 12 mdr.</div>
          <div className="font-semibold tabular-nums">{fmtKr(sum.revenue)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Sidste køb</div>
          <div className="font-semibold">
            {lastP ? `${daysSince(lastP)} dage siden` : "—"}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Top-kategori</div>
          <div className="font-semibold truncate">{top}</div>
        </div>
        {isAdmin && sum.contribution != null && (
          <>
            <div>
              <div className="text-muted-foreground flex items-center gap-1">
                DB <span className="text-[9px] uppercase tracking-wider bg-primary/10 text-primary px-1 rounded">Adm</span>
              </div>
              <div className="font-semibold tabular-nums">{fmtKr(sum.contribution)}</div>
            </div>
            {dg != null && (
              <div>
                <div className="text-muted-foreground flex items-center gap-1">
                  DG <span className="text-[9px] uppercase tracking-wider bg-primary/10 text-primary px-1 rounded">Adm</span>
                </div>
                <div className="font-semibold tabular-nums">{fmtPct(dg)}</div>
              </div>
            )}
          </>
        )}
      </div>
      {topProducts.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Mest købte varer her ({topProducts.length})
          </button>
          {open && (
            <ul className="mt-2 divide-y text-xs">
              {topProducts.map((p) => (
                <li key={p.varenr} className="py-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate">
                    <span className="font-medium">{p.description ?? p.varenr}</span>
                    {p.quantity > 0 && <span className="text-muted-foreground"> · {Math.round(p.quantity)} stk.</span>}
                  </span>
                  <span className="tabular-nums shrink-0">{fmtKr(p.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
