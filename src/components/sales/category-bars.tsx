import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2 } from "lucide-react";
import { groupByCategory, fmtKr, fmtPct, type SalesMonthlyRow } from "@/lib/sales-utils";
import { getTopProductsForCompanyCategory } from "@/lib/sales.functions";
import { Card } from "@/components/ui/card";

export function CategoryBars({
  rows,
  title = "Kategorifordeling",
  companyId,
}: {
  rows: SalesMonthlyRow[];
  title?: string;
  companyId?: string;
}) {
  const data = groupByCategory(rows, 6);
  const total = data.reduce((s, x) => s + x.revenue, 0);
  const [openLabel, setOpenLabel] = useState<string | null>(null);

  if (!data.length) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">Ingen kategoridata.</p>
      </Card>
    );
  }
  const max = data[0].revenue;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <ul className="space-y-2.5">
        {data.map((d) => {
          const pctOfTotal = total > 0 ? d.revenue / total : 0;
          const widthPct = max > 0 ? (d.revenue / max) * 100 : 0;
          const clickable = !!companyId && d.label !== "Øvrigt";
          const isOpen = openLabel === d.label;
          return (
            <li key={d.label}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => setOpenLabel(isOpen ? null : d.label)}
                className={`w-full text-left ${clickable ? "cursor-pointer hover:bg-muted/40 rounded-md px-1 py-0.5 -mx-1" : "cursor-default"}`}
                aria-expanded={isOpen}
              >
                <div className="flex items-baseline justify-between text-sm mb-1">
                  <span className="truncate flex items-center gap-1">
                    {clickable && (
                      <ChevronDown
                        className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                      />
                    )}
                    {d.label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums ml-2 shrink-0">
                    {fmtKr(d.revenue)} · {fmtPct(pctOfTotal, 0)}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary/70 rounded" style={{ width: `${widthPct}%` }} />
                </div>
              </button>
              {isOpen && clickable && companyId && (
                <CategoryDrilldown companyId={companyId} label={d.label} />
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CategoryDrilldown({ companyId, label }: { companyId: string; label: string }) {
  const fetchFn = useServerFn(getTopProductsForCompanyCategory);
  const q = useQuery({
    queryKey: ["category-top", companyId, label],
    queryFn: () => fetchFn({ data: { companyId, categoryLabel: label } }),
    staleTime: 5 * 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="mt-2 ml-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Henter top-varer…
      </div>
    );
  }
  if (q.error) {
    return <div className="mt-2 ml-4 text-xs text-destructive">Kunne ikke hente top-varer.</div>;
  }
  const items = q.data?.topProducts ?? [];
  const isAdmin = !!q.data?.isAdmin;
  if (!items.length) {
    return <div className="mt-2 ml-4 text-xs text-muted-foreground">Ingen vare-data registreret for denne kategori.</div>;
  }
  return (
    <div className="mt-2 ml-4 border-l pl-3 space-y-1.5">
      {items.map((it, i) => (
        <div key={it.varenr} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="truncate">
            <span className="text-muted-foreground tabular-nums mr-1.5">{i + 1}.</span>
            {it.description || it.varenr}
          </span>
          <span className="text-muted-foreground tabular-nums shrink-0">
            {fmtKr(it.revenue)} · {Math.round(it.quantity).toLocaleString("da-DK")} stk
            {isAdmin && it.contribution != null ? ` · DB ${fmtKr(it.contribution)}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
