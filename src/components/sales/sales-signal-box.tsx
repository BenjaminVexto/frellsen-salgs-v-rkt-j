import { AlertTriangle, Coffee } from "lucide-react";
import {
  fmtKr,
  fmtPct,
  filterByPeriod,
  sumRows,
  monthsAgo,
  lastConsumablePurchasePeriod,
  daysSince,
  type SalesMonthlyRow,
} from "@/lib/sales-utils";

export function SalesSignalBox({
  rows,
  hasActiveEquipment,
}: {
  rows: SalesMonthlyRow[];
  hasActiveEquipment?: boolean;
}) {
  return (
    <div className="space-y-2">
      <ConsumableDropSignal rows={rows} hasActiveEquipment={hasActiveEquipment} />
      <RevenueDropSignal rows={rows} />
    </div>
  );
}

function ConsumableDropSignal({
  rows,
  hasActiveEquipment,
}: {
  rows: SalesMonthlyRow[];
  hasActiveEquipment?: boolean;
}) {
  const lastCons = lastConsumablePurchasePeriod(rows);
  if (!lastCons) {
    if (!hasActiveEquipment) return null;
    return (
      <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/60 p-4 flex items-start gap-3">
        <Coffee className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium text-amber-900 dark:text-amber-100">
            Udstyr hos kunden — men ingen forbrugsvarekøb registreret
          </div>
          <div className="text-amber-900/80 dark:text-amber-100/80 mt-0.5">
            Maskinen står der, men kaffen/te/chokoladen købes ikke hos os. Stærkt mersalgssignal.
          </div>
        </div>
      </div>
    );
  }
  const lastDate = new Date(lastCons + "T00:00:00Z");
  // Brug månedsslut som beregningspunkt så vi ikke fyrer signal hver gang vi rammer ny måned.
  const monthEnd = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + 1, 1));
  const daysSinceMonthEnd = Math.floor((Date.now() - monthEnd.getTime()) / 86400000);
  if (!hasActiveEquipment) return null;
  if (daysSinceMonthEnd < 60) return null;
  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/60 p-4 flex items-start gap-3">
      <Coffee className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-medium text-amber-900 dark:text-amber-100">
          Køber ikke forbrugsvarer længere
        </div>
        <div className="text-amber-900/80 dark:text-amber-100/80 mt-0.5">
          Udstyr står hos kunden, men sidste køb af kaffe / te / chokolade / drikke var for {daysSince(lastCons)} dage siden. Måske købes der hos konkurrent — godt opfølgningskald.
        </div>
      </div>
    </div>
  );
}

function RevenueDropSignal({ rows }: { rows: SalesMonthlyRow[] }) {
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

  if (yoy.revenue <= 0) return null;
  if (recent.revenue >= yoy.revenue) return null;
  const recentMonthsWithRevenue = new Set(
    filterByPeriod(rows, m3, nextMonth)
      .filter((r) => (Number(r.revenue) || 0) > 0)
      .map((r) => r.period),
  ).size;
  if (recentMonthsWithRevenue < 2) return null;
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
