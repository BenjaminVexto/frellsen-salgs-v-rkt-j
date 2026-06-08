import { groupByCategory, fmtKr, fmtPct, type SalesMonthlyRow } from "@/lib/sales-utils";
import { Card } from "@/components/ui/card";

export function CategoryBars({ rows, title = "Kategorifordeling" }: { rows: SalesMonthlyRow[]; title?: string }) {
  const data = groupByCategory(rows, 6);
  const total = data.reduce((s, x) => s + x.revenue, 0);
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
          return (
            <li key={d.label}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="truncate">{d.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums ml-2 shrink-0">
                  {fmtKr(d.revenue)} · {fmtPct(pctOfTotal, 0)}
                </span>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary/70 rounded" style={{ width: `${widthPct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
