import { Card } from "@/components/ui/card";
import { fmtKr, monthlyRevenueSeries, type SalesMonthlyRow } from "@/lib/sales-utils";

export function RevenueSparkline({ rows, title = "Omsætning pr. måned (12 mdr.)" }: { rows: SalesMonthlyRow[]; title?: string }) {
  const series = monthlyRevenueSeries(rows, 12);
  const max = Math.max(1, ...series.map((s) => s.revenue));
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="flex items-end gap-1.5 h-32">
        {series.map((s, i) => {
          const h = max > 0 ? Math.max(2, (s.revenue / max) * 100) : 2;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full bg-primary/60 hover:bg-primary rounded-t transition-colors"
                  style={{ height: `${h}%` }}
                  title={`${s.label}: ${fmtKr(s.revenue)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
