import { AlertTriangle } from "lucide-react";
import { fmtKr, fmtPct, filterByPeriod, sumRows, monthsAgo, type SalesMonthlyRow } from "@/lib/sales-utils";

export function SalesSignalBox({ rows }: { rows: SalesMonthlyRow[] }) {
  // Last 3 months vs same 3 months previous year
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  const m3 = monthsAgo(2);
  const m12 = monthsAgo(14); // 12 mo before m3
  const m15 = monthsAgo(11);

  const recent = sumRows(filterByPeriod(rows, m3, nextMonth));
  const yoy = sumRows(filterByPeriod(rows, m12, m15));

  if (yoy.revenue <= 0) return null; // no comparison data
  if (recent.revenue >= yoy.revenue) return null;
  const drop = (yoy.revenue - recent.revenue) / yoy.revenue;

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/60 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-medium text-amber-900 dark:text-amber-100">
          Omsætning faldende — ned {fmtPct(drop, 0)}
        </div>
        <div className="text-amber-900/80 dark:text-amber-100/80 mt-0.5">
          Seneste 3 mdr.: <b>{fmtKr(recent.revenue)}</b> · samme periode året før: <b>{fmtKr(yoy.revenue)}</b>
        </div>
      </div>
    </div>
  );
}
