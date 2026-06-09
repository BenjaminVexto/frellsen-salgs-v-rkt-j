import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ArrowUp, ArrowDown, Minus, ArrowUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getMyPortfolio,
  type PortfolioCompanyRow,
  type RankingRow,
  type ScatterPoint,
  type SignalRow,
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

  // Filters
  const [search, setSearch] = useState("");
  const [kaffeFilter, setKaffeFilter] = useState<"all" | "green" | "yellow" | "red" | "via">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "aktiv" | "sovende" | "paavejvaek">("all");
  const [showDB, setShowDB] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

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
    const searchLc = search.trim().toLowerCase();
    const filtered = data.companies.filter((c) => {
      if (searchLc && !c.name.toLowerCase().includes(searchLc)) return false;
      if (kaffeFilter !== "all") {
        const cls = classifyKaffe(c);
        if (cls !== kaffeFilter) return false;
      }
      if (statusFilter !== "all") {
        const s = classifyStatus(c);
        if (s !== statusFilter) return false;
      }
      return true;
    });
    const arr = [...filtered];
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
  }, [data, sortKey, sortDir, search, kaffeFilter, statusFilter]);

  // Reset pagination when filters/sort change
  useEffect(() => {
    setVisibleCount(50);
  }, [search, kaffeFilter, statusFilter, sortKey, sortDir, sellerId]);

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

          {/* MULIGHEDER & TRUSLER — Lag 3 */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Muligheder &amp; trusler
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="text-xs font-medium text-muted-foreground">Muligheder</div>
                <SignalList
                  title="Maskine men ingen kaffe"
                  description="Aktivt udstyr, ingen forbrugsvarekøb 60+ dage. Forsynes_af-kunder er ikke med."
                  rows={data.signals.machineNoCoffee}
                  kind="machine"
                />
                <SignalList
                  title="White space — mangler et produktben"
                  description="Køber kaffe, men mangler te, chokolade eller drikke/automatvarer."
                  rows={data.signals.whiteSpace}
                  kind="whitespace"
                />
                <SignalList
                  title="I vækst — køber mere end sidste år"
                  description="Omsætning 12 mdr. er højere end forrige 12 mdr. Værd at fastholde."
                  rows={data.signals.growing}
                  kind="growth"
                />
              </div>
              <div className="space-y-4">
                <div className="text-xs font-medium text-muted-foreground">Trusler</div>
                <SignalList
                  title="Faldende — køber mindre end sidste år"
                  description="Omsætning er faldet, men kunden køber stadig. Tidlig advarsel."
                  rows={data.signals.declining}
                  kind="decline"
                />
                <SignalList
                  title="Aftale udløber inden for 90 dage"
                  description="Maskine- eller serviceaftaler tæt på udløb."
                  rows={data.signals.expiringAgreements}
                  kind="expiry"
                />
                <SignalList
                  title="Konkurrentaftale udløber"
                  description="Genvindings-muligheder — konkurrentaftaler nær udløb."
                  rows={data.signals.expiringCompetitor}
                  kind="expiry"
                />
              </div>
            </div>
          </section>
        </>
      )}

    </div>
  );
}

function SignalList({
  title,
  description,
  rows,
  kind,
  initial = 10,
}: {
  title: string;
  description: string;
  rows: SignalRow[];
  kind: "machine" | "whitespace" | "growth" | "decline" | "expiry";
  initial?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, initial);
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {!rows.length ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">Ingen kunder.</div>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((r) => (
            <li key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-accent/30">
              <div className="min-w-0">
                <Link
                  to="/virksomheder/$id"
                  params={{ id: r.id }}
                  className="font-medium text-sm hover:underline truncate block"
                >
                  {r.name}
                </Link>
                {r.city && <div className="text-xs text-muted-foreground">{r.city}</div>}
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <SignalMeta row={r} kind={kind} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > initial && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 text-xs text-muted-foreground hover:bg-accent/40 border-t border-border"
        >
          {expanded ? "Vis færre" : `Vis alle (${rows.length})`}
        </button>
      )}
    </Card>
  );
}

function SignalMeta({ row, kind }: { row: SignalRow; kind: string }) {
  if (kind === "machine") {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="tabular-nums">
          {row.daysSinceConsumable === null ? "ingen køb" : `${row.daysSinceConsumable}d siden`}
        </span>
        {row.consumableAvgPerMonth && row.consumableAvgPerMonth > 0 && (
          <span className="text-[11px]">
            tidl. {fmtKr(row.consumableAvgPerMonth)}/md
          </span>
        )}
      </div>
    );
  }
  if (kind === "whitespace") {
    return (
      <div className="flex flex-wrap justify-end gap-1 max-w-[260px]">
        {row.missingGroups.map((g) => (
          <Badge key={g} variant="outline" className="text-[10px] font-normal">
            mangler {g}
          </Badge>
        ))}
        <div className="w-full text-right tabular-nums">{fmtKr(row.revenue12m)}</div>
      </div>
    );
  }
  if (kind === "growth" || kind === "decline") {
    const pct = row.growthPct ?? 0;
    const up = pct > 0;
    const Icon = up ? ArrowUp : ArrowDown;
    const cls = up ? "text-emerald-600 dark:text-emerald-500" : "text-destructive";
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className={`inline-flex items-center gap-0.5 ${cls}`}>
          <Icon className="h-3 w-3" />
          {Math.abs(Math.round(pct))} %
        </span>
        <span className="tabular-nums text-[11px]">{fmtKr(row.revenue12m)}</span>
      </div>
    );
  }
  // expiry
  const d = row.expiresAt ? new Date(row.expiresAt + "T00:00:00Z") : null;
  const days = d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums">
        {d ? d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : "—"}
      </span>
      <span className="text-[11px]">
        {row.expiryLabel}
        {days !== null && ` · om ${days}d`}
      </span>
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

function RankingTable({
  title,
  rows,
  valueLabel,
  valueField = "revenue12m",
  showTrend = true,
  showEmployees = false,
  emptyText = "Ingen data.",
}: {
  title: string;
  rows: RankingRow[];
  valueLabel: string;
  valueField?: "revenue12m" | "contribution12m" | "ratio";
  showTrend?: boolean;
  showEmployees?: boolean;
  emptyText?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {!rows.length ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Kunde</th>
                {showEmployees && <th className="px-3 py-2 text-right">Ansatte</th>}
                <th className="px-3 py-2 text-right">{valueLabel}</th>
                {showTrend && <th className="px-3 py-2 text-right">YoY</th>}
                <th className="px-3 py-2 text-left">Kaffe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const value =
                  valueField === "contribution12m"
                    ? r.contribution12m ?? 0
                    : valueField === "ratio"
                    ? r.ratio ?? 0
                    : r.revenue12m;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-accent/30">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link
                        to="/virksomheder/$id"
                        params={{ id: r.id }}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.city && <div className="text-xs text-muted-foreground">{r.city}</div>}
                    </td>
                    {showEmployees && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.employees?.toLocaleString("da-DK") ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {valueField === "ratio"
                        ? `${fmtKr(value)} / ansat`
                        : value > 0
                        ? fmtKr(value)
                        : "—"}
                    </td>
                    {showTrend && (
                      <td className="px-3 py-2 text-right">
                        <Trend current={r.revenue12m} prior={r.revenue12mPrior} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <KaffeIndicator
                        lastConsumableDate={r.last_consumable_sales_date}
                        suppliedViaName={r.supplied_via_name}
                        suppliedViaId={r.supplied_via_id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Trend({ current, prior }: { current: number; prior: number }) {
  if (prior <= 0 && current <= 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const diff = current - prior;
  const pct = prior !== 0 ? Math.round((diff / Math.abs(prior)) * 100) : null;
  const up = diff > 0;
  const down = diff < 0;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const cls = up
    ? "text-emerald-600 dark:text-emerald-500"
    : down
    ? "text-destructive"
    : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${cls}`}>
      <Icon className="h-3 w-3" />
      {pct === null ? "ny" : `${Math.abs(pct)} %`}
    </span>
  );
}

function ScatterPlot({ points }: { points: ScatterPoint[] }) {
  const width = 760;
  const height = 360;
  const pad = { top: 16, right: 16, bottom: 36, left: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (!points.length) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Ingen datapunkter at vise — kræver aktive privatkunder med medarbejdertal.
      </Card>
    );
  }

  // Log-scale for both axes (employees and revenue span many orders of magnitude)
  const xs = points.map((p) => Math.max(1, p.employees));
  const ys = points.map((p) => Math.max(1, p.revenue12m));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const lx = (v: number) =>
    pad.left + ((Math.log10(v) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin) || 1)) * innerW;
  const ly = (v: number) =>
    pad.top + innerH - ((Math.log10(v) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin) || 1)) * innerH;

  // Median split — "potentiale-zonen" = nedre højre kvadrant (mange ansatte, lav omsætning)
  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);
  const xMed = sortedX[Math.floor(sortedX.length / 2)];
  const yMed = sortedY[Math.floor(sortedY.length / 2)];
  const xMedPx = lx(xMed);
  const yMedPx = ly(yMed);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          Omsætning vs. medarbejdere ({points.length} kunder)
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-warning/30" /> Potentiale-zone
          </span>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* Potentiale-zone: nedre højre */}
          <rect
            x={xMedPx}
            y={yMedPx}
            width={pad.left + innerW - xMedPx}
            height={pad.top + innerH - yMedPx}
            className="fill-warning/20"
          />
          <text x={pad.left + innerW - 8} y={pad.top + innerH - 8} textAnchor="end" className="fill-warning-foreground text-[10px] font-medium">
            Potentiale
          </text>

          {/* Axes */}
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + innerH} className="stroke-border" />
          <line x1={pad.left} y1={pad.top + innerH} x2={pad.left + innerW} y2={pad.top + innerH} className="stroke-border" />

          {/* Axis labels */}
          <text x={pad.left + innerW / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            Antal medarbejdere (log)
          </text>
          <text
            x={14}
            y={pad.top + innerH / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${pad.top + innerH / 2})`}
            className="fill-muted-foreground text-[11px]"
          >
            Omsætning 12 mdr. (log)
          </text>

          {/* Ticks */}
          <text x={pad.left} y={pad.top + innerH + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {xMin}
          </text>
          <text x={pad.left + innerW} y={pad.top + innerH + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {xMax.toLocaleString("da-DK")}
          </text>
          <text x={pad.left - 6} y={pad.top + innerH} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {fmtKr(yMin)}
          </text>
          <text x={pad.left - 6} y={pad.top + 8} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {fmtKr(yMax)}
          </text>

          {/* Points */}
          {points.map((p) => (
            <a key={p.id} href={`/virksomheder/${p.id}`}>
              <circle
                cx={lx(Math.max(1, p.employees))}
                cy={ly(Math.max(1, p.revenue12m))}
                r={4}
                className="fill-primary/70 hover:fill-primary stroke-primary-foreground"
                strokeWidth={1}
              >
                <title>{`${p.name} — ${p.employees.toLocaleString("da-DK")} ansatte · ${fmtKr(p.revenue12m)}`}</title>
              </circle>
            </a>
          ))}
        </svg>
      </div>
    </Card>
  );
}
