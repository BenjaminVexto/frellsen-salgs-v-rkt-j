import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, Activity, Wallet, Loader2, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { getMyMonthlySales, getMyNewActivitiesCount } from "@/lib/sales.functions";
import { fmtKr } from "@/lib/sales-utils";

export function MyMonthZone() {
  const salesFn = useServerFn(getMyMonthlySales);
  const actFn = useServerFn(getMyNewActivitiesCount);

  const salesQ = useQuery({ queryKey: ["my-month-sales"], queryFn: () => salesFn({}) });
  const actQ = useQuery({ queryKey: ["my-month-activities"], queryFn: () => actFn({}) });

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Din måned
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        <BudgetCard />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Nye aktiviteter denne måned"
          value={actQ.isLoading ? "…" : String(actQ.data?.count ?? 0)}
          loading={actQ.isLoading}
        />
        <MetricCard
          icon={<Wallet className="h-4 w-4" />}
          label="Min omsætning denne måned"
          value={salesQ.isLoading ? "…" : fmtKr(salesQ.data?.revenue ?? 0)}
          sub={
            salesQ.data && salesQ.data.companies > 0
              ? `${salesQ.data.companies} ${salesQ.data.companies === 1 ? "kunde" : "kunder"} med køb`
              : undefined
          }
          comparison={
            salesQ.data
              ? {
                  current: salesQ.data.revenue,
                  lastYear: salesQ.data.revenueLastYear,
                }
              : undefined
          }
          loading={salesQ.isLoading}
        />
      </div>
    </section>
  );
}

function BudgetCard() {
  // No budget table yet — placeholder
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const expectedPct = Math.round((dayOfMonth / daysInMonth) * 100);

  return (
    <Card className="p-4 border-dashed">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Target className="h-4 w-4" />
        <span>Budget</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded">
          Kommer
        </span>
      </div>
      <div className="text-sm text-muted-foreground mt-2">
        Sæt et månedsmål for at se fremdrift
      </div>
      <div className="mt-3 space-y-1">
        <Progress value={0} className="h-1.5" />
        <div className="text-[10px] text-muted-foreground">
          Forventet på denne dato: {expectedPct}% (dag {dayOfMonth}/{daysInMonth})
        </div>
      </div>
    </Card>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  comparison,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  comparison?: { current: number; lastYear: number };
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl md:text-2xl font-semibold tabular-nums flex items-center gap-2 break-all">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : value}
      </div>

      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      {comparison && !loading && <YoYLine current={comparison.current} lastYear={comparison.lastYear} />}
    </Card>
  );
}

function YoYLine({ current, lastYear }: { current: number; lastYear: number }) {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const proRataLastYear = lastYear * (dayOfMonth / daysInMonth);
  const diff = current - proRataLastYear;
  const pct = proRataLastYear !== 0 ? Math.round((diff / Math.abs(proRataLastYear)) * 100) : null;
  const up = diff > 0;
  const down = diff < 0;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const colorCls = up ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground";
  return (
    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
      <span className={`inline-flex items-center gap-0.5 ${colorCls}`}>
        <Icon className="h-3 w-3" />
        {pct === null ? "—" : `${Math.abs(pct)} %`}
      </span>
      <span>· samme periode sidste år (est.): ~{fmtKr(Math.round(proRataLastYear))}</span>
    </div>
  );
}
