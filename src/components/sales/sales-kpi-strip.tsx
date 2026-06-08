import { Card } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Calendar, MapPin, TrendingUp, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  fmtKr,
  fmtPct,
  daysSince,
  monthsAgo,
  filterByPeriod,
  sumRows,
  lastPurchasePeriod,
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
  const periodNow = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
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

  const trend = prev12Sum.revenue > 0 ? (last12Sum.revenue - prev12Sum.revenue) / prev12Sum.revenue : null;
  const last = lastPurchasePeriod(rows);

  // DG = contribution / revenue
  const dg = isAdmin && last12Sum.contribution != null && last12Sum.revenue > 0
    ? last12Sum.contribution / last12Sum.revenue
    : null;

  return (
    <div className={`grid gap-3 ${isAdmin ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
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
        label="Sidste køb"
        value={last ? format(parseISO(last), "MMM yyyy", { locale: da }) : "—"}
        trail={
          last ? (
            <span className="text-xs text-muted-foreground">for {daysSince(last)} dage siden</span>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen registreret køb</span>
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
