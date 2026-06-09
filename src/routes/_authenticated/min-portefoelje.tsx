import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ArrowUp, ArrowDown, Minus, ArrowUpDown } from "lucide-react";
import {
  getMyPortfolio,
  type PortfolioCompanyRow,
  type RankingRow,
  type ScatterPoint,
} from "@/lib/portfolio.functions";
import { fmtKr } from "@/lib/sales-utils";


export const Route = createFileRoute("/_authenticated/min-portefoelje")({
  component: PortfolioPage,
  head: () => ({ meta: [{ title: "Min salgsstatistik — Frellsen" }] }),
});

type SortKey =
  | "name"
  | "status"
  | "revenue12m"
  | "consumable"
  | string; // "month:<period>"

function PortfolioPage() {
  const fn = useServerFn(getMyPortfolio);
  const [sellerId, setSellerId] = useState<string | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("month:last");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const q = useQuery({
    queryKey: ["portfolio", sellerId],
    queryFn: () =>
      fn({
        data: { sellerId: sellerId === "all" ? null : sellerId },
      }),
  });

  const data = q.data;
  const isAdmin = data?.isAdmin ?? false;

  const sortedCompanies = useMemo(() => {
    if (!data) return [] as PortfolioCompanyRow[];
    const arr = [...data.companies];
    const key = sortKey;
    const dir = sortDir === "asc" ? 1 : -1;
    const lastPeriod = data.monthLabels[data.monthLabels.length - 1]?.period;
    arr.sort((a, b) => {
      let av: any;
      let bv: any;
      if (key === "name") {
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
      } else if (key === "status") {
        av = a.customer_type ?? "";
        bv = b.customer_type ?? "";
      } else if (key === "revenue12m") {
        av = a.revenue12m;
        bv = b.revenue12m;
      } else if (key === "consumable") {
        av = a.last_consumable_sales_date ?? "";
        bv = b.last_consumable_sales_date ?? "";
      } else if (key.startsWith("month:")) {
        const p = key === "month:last" ? lastPeriod : key.slice(6);
        const am = a.monthly.find((m) => m.period === p);
        const bm = b.monthly.find((m) => m.period === p);
        av = am?.revenue ?? 0;
        bv = bm?.revenue ?? 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-semibold">Min salgsstatistik</h1>
          <p className="text-sm text-muted-foreground">
            Puls og månedlig udvikling på din portefølje.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sælger:</span>
            <Select value={sellerId} onValueChange={(v) => setSellerId(v as any)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Vælg sælger" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle sælgere</SelectItem>
                {(data?.sellerOptions ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter portefølje…
        </div>
      ) : !data ? (
        <Card className="p-6 text-sm text-muted-foreground">Ingen data.</Card>
      ) : (
        <>
          {/* PULS */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Porteføljens puls
            </h2>
            <div className={`grid gap-3 ${isAdmin ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              <RevenueCard
                label="Porteføljeomsætning · 12 mdr."
                current={data.totals.revenue12m}
                prior={data.totals.revenue12mPriorYear}
              />
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Fordeling</div>
                <div className="text-lg font-semibold mb-2">
                  {data.statusCounts.total}{" "}
                  <span className="text-sm text-muted-foreground font-normal">kunder</span>
                </div>
                <div className="space-y-1 text-sm">
                  <Pill color="success" label="aktive" n={data.statusCounts.aktive} />
                  <Pill color="warning" label="sovende" n={data.statusCounts.sovende} />
                  <Pill color="destructive" label="på vej væk" n={data.statusCounts.paaVejVaek} />
                </div>
              </Card>
              {isAdmin && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">DB · 12 mdr. (admin)</div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmtKr(data.totals.contribution12m ?? 0)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    DG:{" "}
                    {data.totals.revenue12m > 0
                      ? `${Math.round(
                          ((data.totals.contribution12m ?? 0) / data.totals.revenue12m) * 100,
                        )} %`
                      : "—"}
                  </div>
                </Card>
              )}
            </div>
          </section>

          {/* TABEL */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>
                      Kunde
                    </Th>
                    <Th onClick={() => toggleSort("consumable")} active={sortKey === "consumable"} dir={sortDir}>
                      Kaffe
                    </Th>
                    {data.monthLabels.map((m, i) => {
                      const isLast = i === data.monthLabels.length - 1;
                      const key = isLast ? "month:last" : `month:${m.period}`;
                      return (
                        <Th
                          key={m.period}
                          onClick={() => toggleSort(key)}
                          active={sortKey === key || (isLast && sortKey === "month:last")}
                          dir={sortDir}
                          align="right"
                        >
                          {m.label}
                        </Th>
                      );
                    })}
                    <Th
                      onClick={() => toggleSort("revenue12m")}
                      active={sortKey === "revenue12m"}
                      dir={sortDir}
                      align="right"
                    >
                      12 mdr.
                    </Th>
                    <Th onClick={() => toggleSort("status")} active={sortKey === "status"} dir={sortDir}>
                      Status
                    </Th>
                    {isAdmin && <th className="px-3 py-2 text-right">DB 12m</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedCompanies.map((c) => (
                    <tr key={c.id} className="border-t border-border hover:bg-accent/30">
                      <td className="px-3 py-2">
                        <Link
                          to="/virksomheder/$id"
                          params={{ id: c.id }}
                          className="font-medium hover:underline"
                        >
                          {c.name}
                        </Link>
                        {c.city && (
                          <div className="text-xs text-muted-foreground">{c.city}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <KaffeIndicator
                          lastConsumableDate={c.last_consumable_sales_date}
                          suppliedViaName={c.supplied_via_name}
                          suppliedViaId={c.supplied_via_id}
                        />
                      </td>
                      {c.monthly.map((m) => (
                        <td key={m.period} className="px-3 py-2 text-right tabular-nums">
                          {m.revenue > 0 ? fmtKr(m.revenue) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {c.revenue12m > 0 ? fmtKr(c.revenue12m) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge type={c.customer_type} />
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-right tabular-nums">
                          {(c.contribution12m ?? 0) !== 0 ? fmtKr(c.contribution12m ?? 0) : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                  {!sortedCompanies.length && (
                    <tr>
                      <td colSpan={99} className="px-3 py-10 text-center text-muted-foreground">
                        Ingen kunder i porteføljen.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* RANKINGS — Lag 2 */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Top &amp; bund — rangeringer
            </h2>
            <Tabs defaultValue="revenue">
              <TabsList>
                <TabsTrigger value="revenue">Omsætning</TabsTrigger>
                {isAdmin && <TabsTrigger value="db">Dækningsbidrag</TabsTrigger>}
                <TabsTrigger value="potential">Potentiale-ratio</TabsTrigger>
              </TabsList>

              <TabsContent value="revenue" className="mt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <RankingTable
                    title="Top 25 — højest omsætning (12 mdr.)"
                    rows={data.rankings.topRevenue}
                    valueLabel="Omsætning"
                    showTrend
                  />
                  <RankingTable
                    title="Bund 25 — lavest omsætning blandt aktive kunder"
                    rows={data.rankings.bottomRevenueActive}
                    valueLabel="Omsætning"
                    showTrend
                    emptyText="Ingen aktive kunder i porteføljen."
                  />
                </div>
              </TabsContent>

              {isAdmin && data.rankings.topContribution && (
                <TabsContent value="db" className="mt-4">
                  <RankingTable
                    title="Top 25 — mest profitable kunder (DB 12 mdr.)"
                    rows={data.rankings.topContribution}
                    valueLabel="DB"
                    valueField="contribution12m"
                    showTrend={false}
                  />
                </TabsContent>
              )}

              <TabsContent value="potential" className="mt-4 space-y-4">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">
                    Potentiale-ratio = omsætning 12 mdr. ÷ antal medarbejdere.
                    Aktive privatkunder med kendt medarbejdertal. Offentlige kunder
                    (kundeprisgruppe 40/45) er udeladt.
                    {data.rankings.potentialMissingEmployees > 0 && (
                      <>
                        {" "}
                        <span className="font-medium text-foreground">
                          {data.rankings.potentialMissingEmployees}
                        </span>{" "}
                        kunder mangler medarbejdertal og indgår ikke.
                      </>
                    )}
                  </div>
                </Card>
                <ScatterPlot points={data.rankings.potentialScatter} />
                <RankingTable
                  title="25 kunder med størst uudnyttet potentiale"
                  rows={data.rankings.potential}
                  valueLabel="kr./ansat"
                  valueField="ratio"
                  showEmployees
                  showTrend={false}
                />
              </TabsContent>
            </Tabs>
          </section>
        </>
      )}

    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
      >
        {children}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function Pill({
  color,
  label,
  n,
}: {
  color: "success" | "warning" | "destructive";
  label: string;
  n: number;
}) {
  const cls =
    color === "success"
      ? "bg-success/15 text-success"
      : color === "warning"
      ? "bg-warning/20 text-warning-foreground"
      : "bg-destructive/15 text-destructive";
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium px-2 py-0.5 rounded ${cls} tabular-nums`}>{n}</span>
    </div>
  );
}

function KaffeIndicator({
  lastConsumableDate,
  suppliedViaName,
  suppliedViaId,
}: {
  lastConsumableDate: string | null;
  suppliedViaName: string | null;
  suppliedViaId: string | null;
}) {
  if (suppliedViaId && suppliedViaName) {
    return (
      <Link
        to="/virksomheder/$id"
        params={{ id: suppliedViaId }}
        className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
        title="Forbrugsvarer leveres via en anden konto"
      >
        <span className="h-2 w-2 rounded-full bg-blue-500" />
        via {suppliedViaName}
      </Link>
    );
  }
  if (!lastConsumableDate) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
        <span className="text-muted-foreground">ingen køb</span>
      </span>
    );
  }
  const days = Math.floor(
    (Date.now() - new Date(lastConsumableDate + "T00:00:00Z").getTime()) / 86400000,
  );
  if (days <= 60) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="h-2.5 w-2.5 rounded-full bg-success" />
        <span className="text-muted-foreground">{days}d</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="h-2.5 w-2.5 rounded-full bg-warning" />
      <span className="text-muted-foreground">{days}d siden</span>
    </span>
  );
}

function StatusBadge({ type }: { type: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    aktiv_kunde: { label: "aktiv", cls: "bg-success/15 text-success" },
    sovende_kunde: { label: "sovende", cls: "bg-warning/20 text-warning-foreground" },
    tidligere_kunde: { label: "tidligere", cls: "bg-destructive/15 text-destructive" },
    nyt_emne: { label: "nyt emne", cls: "bg-muted text-muted-foreground" },
  };
  const m = type ? map[type] : null;
  if (!m) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}

function RevenueCard({
  label,
  current,
  prior,
}: {
  label: string;
  current: number;
  prior: number;
}) {
  // Pro-rate current month within the 12m windows: simplified — compare raw 12m sums.
  // Day-pro-rata applied: take just current incomplete-month vs prior same-month.
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const fraction = dayOfMonth / daysInMonth;
  // For trend display: don't pro-rate the whole window; compare raw 12m sums but
  // estimate prior pro-rata by reducing prior by (1 - fraction) of one month's avg.
  const priorAvgMonth = prior / 12;
  const priorAdjusted = prior - priorAvgMonth * (1 - fraction);
  const diff = current - priorAdjusted;
  const pct =
    priorAdjusted !== 0 ? Math.round((diff / Math.abs(priorAdjusted)) * 100) : null;
  const up = diff > 0;
  const down = diff < 0;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const colorCls = up
    ? "text-emerald-600 dark:text-emerald-500"
    : down
    ? "text-destructive"
    : "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{fmtKr(current)}</div>
      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
        <span className={`inline-flex items-center gap-0.5 ${colorCls}`}>
          <Icon className="h-3 w-3" />
          {pct === null ? "—" : `${Math.abs(pct)} %`}
        </span>
        <span>· vs. samme periode sidste år (~{fmtKr(Math.round(priorAdjusted))})</span>
      </div>
    </Card>
  );
}
