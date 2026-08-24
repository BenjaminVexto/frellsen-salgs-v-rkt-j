import { AlertTriangle, Coffee } from "lucide-react";
import {
  fmtKr,
  fmtPct,
  filterByPeriod,
  sumRows,
  monthsAgo,
  lastConsumablePurchasePeriod,
  daysSince,
  isMachineGroup,
  type SalesMonthlyRow,
} from "@/lib/sales-utils";

export function SalesSignalBox({
  rows,
  hasActiveEquipment,
  isSuppliedVia,
}: {
  rows: SalesMonthlyRow[];
  hasActiveEquipment?: boolean;
  isSuppliedVia?: boolean;
}) {
  return (
    <div className="space-y-2">
      <ConsumableDropSignal rows={rows} hasActiveEquipment={hasActiveEquipment} isSuppliedVia={isSuppliedVia} />
      <RevenueDropSignal rows={rows} />
    </div>
  );
}

function ConsumableDropSignal({
  rows,
  hasActiveEquipment,
  isSuppliedVia,
}: {
  rows: SalesMonthlyRow[];
  hasActiveEquipment?: boolean;
  isSuppliedVia?: boolean;
}) {
  if (isSuppliedVia) return null;
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
  // 6 hele måneder mod samme 6 måneder året før. Den igangværende måned indgår ikke.
  const nonMachineRows = rows.filter((r) => !isMachineGroup(r.product_group_1));

  // Støjtesten forhindrer, at en bestillingsrytme i store partier ser ud som et fald.
  if (!bestaarStoejtest(rows)) return null;

  const nu = currentMonthStart();
  const nuFra = monthsAgo(6);
  const foerFra = monthsAgo(18);
  const foerTil = monthsAgo(12);

  const recent = sumRows(filterByPeriod(nonMachineRows, nuFra, nu));
  const yoy = sumRows(filterByPeriod(nonMachineRows, foerFra, foerTil));

  if (yoy.revenue <= 0) return null;
  if (recent.revenue >= yoy.revenue) return null;
  const drop = (yoy.revenue - recent.revenue) / yoy.revenue;
  if (drop < 0.25) return null;

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/60 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-medium text-amber-900 dark:text-amber-100">
          Forbrugsvare-omsætning faldende — ned {fmtPct(drop, 0)}
        </div>
        <div className="text-amber-900/80 dark:text-amber-100/80 mt-0.5">
          Ekskl. maskinsalg. Seneste 6 hele mdr.: <b>{fmtKr(recent.revenue)}</b> · samme 6 mdr. året før: <b>{fmtKr(yoy.revenue)}</b>
        </div>
      </div>
    </div>
  );
}
