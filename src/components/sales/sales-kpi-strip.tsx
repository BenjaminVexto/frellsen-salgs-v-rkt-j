import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Calendar, Coffee, MapPin, TrendingUp, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  fmtKr,
  fmtKg,
  fmtPct,
  daysSince,
  monthsAgo,
  filterByPeriod,
  sumRows,
  lastPurchasePeriod,
  lastConsumablePurchasePeriod,
  isConsumableGroup,
  type SalesMonthlyRow,
} from "@/lib/sales-utils";

export function SalesKpiStrip({
  rows,
  isAdmin,
  locationsTotal,
  locationsActive,
}: {
  rows: SalesMonthlyRow[];
  isAdmin: boolean;
  locationsTotal?: number;
  locationsActive?: number;
}) {
  const now = new Date();
  // next-month exclusive for filter
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  const m12 = monthsAgo(11); // include current
  const m24 = monthsAgo(23);

  const last12 = filterByPeriod(rows, m12, nextMonth);
  const prev12 = filterByPeriod(rows, m24, m12);
  const last12Sum = sumRows(last12);
  const prev12Sum = sumRows(prev12);

  // Kg-forbrug: kun forbrugsvaregrupper (kaffe/te/drikke/chokolade)
  const last12ConsSum = sumRows(last12.filter((r) => isConsumableGroup(r.product_group_1)));
  const prev12ConsSum = sumRows(prev12.filter((r) => isConsumableGroup(r.product_group_1)));
  const kgTrend =
    prev12ConsSum.weightKg > 0
      ? (last12ConsSum.weightKg - prev12ConsSum.weightKg) / prev12ConsSum.weightKg
      : null;

  const trend = prev12Sum.revenue > 0 ? (last12Sum.revenue - prev12Sum.revenue) / prev12Sum.revenue : null;
  const lastAll = lastPurchasePeriod(rows);
  const lastCons = lastConsumablePurchasePeriod(rows);

  // DG = contribution / revenue
  const dg = isAdmin && last12Sum.contribution != null && last12Sum.revenue > 0
    ? last12Sum.contribution / last12Sum.revenue
    : null;

  return (
    <div className={`grid gap-3 ${isAdmin ? "md:grid-cols-3 lg:grid-cols-6" : "md:grid-cols-2 lg:grid-cols-5"}`}>
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Omsætning (12 mdr.)"
        value={fmtKr(last12Sum.revenue)}
        trail={
          trend != null ? (
            <span className={`text-xs inline-flex items-center gap-0.5 ${trend >= 0 ? "text-success" : "text-destructive"}`}>
              {trend >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {fmtPct(Math.abs(trend))} vs. forrige 12 mdr.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen historik for sammenligning</span>
          )
        }
      />
      <KpiCard
        icon={<Coffee className="h-4 w-4" />}
        label="Kg forbrug (12 mdr.)"
        value={fmtKg(last12ConsSum.weightKg)}
        trail={
          kgTrend != null ? (
            <span className={`text-xs inline-flex items-center gap-0.5 ${kgTrend >= 0 ? "text-success" : "text-destructive"}`}>
              {kgTrend >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {fmtPct(Math.abs(kgTrend))} vs. forrige 12 mdr.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Kaffe / te / drikke / chokolade</span>
          )
        }
      />

      {isAdmin && (
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Dækningsbidrag (12 mdr.)"
          value={last12Sum.contribution != null ? fmtKr(last12Sum.contribution) : "—"}
          trail={dg != null ? <span className="text-xs text-muted-foreground">DG: {fmtPct(dg)}</span> : null}
          admin
        />
      )}
      <KpiCard
        icon={<Calendar className="h-4 w-4" />}
        label="Sidste køb (alt)"
        value={lastAll ? format(parseISO(lastAll), "MMM yyyy", { locale: da }) : "—"}
        trail={
          lastAll ? (
            <span className="text-xs text-muted-foreground">for {daysSince(lastAll)} dage siden · alt salg + udstyr</span>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen registreret køb</span>
          )
        }
      />
      <KpiCard
        icon={<Coffee className="h-4 w-4" />}
        label="Sidste varekøb (forbrug)"
        value={lastCons ? format(parseISO(lastCons), "MMM yyyy", { locale: da }) : "—"}
        trail={
          lastCons ? (
            <span className="text-xs text-muted-foreground">for {daysSince(lastCons)} dage siden · kaffe / te / chokolade / drikke</span>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen forbrugsvarekøb registreret</span>
          )
        }
      />
      <KpiCard
        icon={<MapPin className="h-4 w-4" />}
        label="Aktive lokationer"
        value={
          locationsTotal != null
            ? `${locationsActive ?? 0} af ${locationsTotal}`
            : "—"
        }
        trail={<span className="text-xs text-muted-foreground">køb seneste 6 mdr.</span>}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  trail,
  admin,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trail?: React.ReactNode;
  admin?: boolean;
}) {
  return (
    <Card className={`p-4 ${admin ? "border-dashed border-primary/40" : ""} relative`}>
      {admin && (
        <span className="absolute top-2 right-2 text-[10px] font-medium tracking-wider uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded">
          Admin
        </span>
      )}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {trail && <div className="mt-1">{trail}</div>}
    </Card>
  );
}
