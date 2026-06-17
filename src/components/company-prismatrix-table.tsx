import { Fragment, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Loader2, Download, ChevronRight, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  listPricingForCompany,
  deriveRowLabel,
  extractLeadingCode,
  extractGroupLabel,
  type MatchSource,
  type PricingRow,
} from "@/lib/agreement-pricing.functions";

const SOURCE_LABEL: Record<MatchSource, string> = {
  kundenr: "Kundenr",
  "kp1+kp2": "KP1+KP2",
  kp1: "KP1",
  kp2: "KP2",
};

const SOURCE_PRIO: Record<MatchSource, number> = {
  kundenr: 4,
  "kp1+kp2": 3,
  kp1: 2,
  kp2: 1,
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "d. MMM yyyy", { locale: da });
  } catch {
    return d;
  }
}

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("da-DK", { maximumFractionDigits: 2 });
}

function fmtDiscount(r: PricingRow): string {
  const pct = Number(r.rab_pct ?? 0);
  const kr = Number(r.rab_kr ?? 0);
  if (pct > 0 && kr > 0) return `${fmtNum(pct)}% + ${fmtNum(kr)} kr`;
  if (pct > 0) return `${fmtNum(pct)}%`;
  if (kr > 0) return `${fmtNum(kr)} kr`;
  return "—";
}

type Phase = "active" | "future" | "expired";

function classifyPhase(r: PricingRow, today: string): Phase {
  const fra = r.fra_dato ?? null;
  const til = r.til_dato ?? null;
  if (fra && fra > today) return "future";
  if (til && til < today) return "expired";
  return "active";
}

type Group = {
  key: string;
  label: string;
  sublabel: string | null;
  match_source: MatchSource | null;
  rows: PricingRow[];
  active: PricingRow | null;
  future: PricingRow[];
  expired: PricingRow[];
};

function buildGroups(rows: PricingRow[]): Group[] {
  const today = format(new Date(), "yyyy-MM-dd");
  const map = new Map<string, Group>();

  for (const r of rows) {
    const varenr = (r.varenr ?? "").trim();
    const pg1 = extractLeadingCode(r.produktprisgruppe1) ?? "";
    const pg2 = extractLeadingCode(r.produktprisgruppe2) ?? "";
    const pg3 = extractLeadingCode(r.produktprisgruppe3) ?? "";
    const kundenr = (r.fak_kundenr ?? "").trim();
    const kp1 = extractLeadingCode(r.kundeprisgruppe1) ?? "";
    const kp2 = extractLeadingCode(r.kundeprisgruppe2) ?? "";

    // Match-nøgle: kundespecifik + produktspecifik kombineret.
    const key = [
      r.match_source ?? "?",
      `c=${kundenr}`,
      `k1=${kp1}`,
      `k2=${kp2}`,
      `v=${varenr && varenr !== "0" ? varenr : ""}`,
      `p1=${pg1}`,
      `p2=${pg2}`,
      `p3=${pg3}`,
    ].join("|");

    const primary = deriveRowLabel(r);
    // Hvis labelen kom fra pg3, vis pg2-gruppen som undertekst så fx
    // pg2=78 "Maskiner-salg" vs pg2=79 "Maskiner-tilbehør" adskilles visuelt.
    let sublabel: string | null = null;
    const pg3Label = extractGroupLabel(r.produktprisgruppe3);
    const pg2Label = extractGroupLabel(r.produktprisgruppe2);
    if (pg3Label && pg2Label && pg3Label !== pg2Label) {
      sublabel = pg2Label;
    }

    const g =
      map.get(key) ??
      ({
        key,
        label: primary,
        sublabel,
        match_source: r.match_source ?? null,
        rows: [],
        active: null,
        future: [],
        expired: [],
      } as Group);
    g.rows.push(r);
    map.set(key, g);
  }

  // Klassificér og vælg aktiv pr. gruppe.
  for (const g of map.values()) {
    const active: PricingRow[] = [];
    for (const r of g.rows) {
      const phase = classifyPhase(r, today);
      if (phase === "active") active.push(r);
      else if (phase === "future") g.future.push(r);
      else g.expired.push(r);
    }
    // Vinder ved flere aktive: højeste rab_pct, derefter rab_kr — samme rangering
    // som get_quote_floor_discount bruger som tiebreak inden for samme prioritet.
    active.sort((a, b) => {
      const ap = Number(a.rab_pct ?? 0);
      const bp = Number(b.rab_pct ?? 0);
      if (bp !== ap) return bp - ap;
      const ak = Number(a.rab_kr ?? 0);
      const bk = Number(b.rab_kr ?? 0);
      return bk - ak;
    });
    g.active = active[0] ?? null;
    // Hvis ingen aktiv: vis nyeste fremtidige som "header" rab, men marker som ikke aktiv.
    g.future.sort((a, b) => (a.fra_dato ?? "").localeCompare(b.fra_dato ?? ""));
    g.expired.sort((a, b) => (b.til_dato ?? "").localeCompare(a.til_dato ?? ""));
  }

  // Sortering: aktive grupper først, dernæst efter match-prioritet, dernæst label.
  return Array.from(map.values()).sort((a, b) => {
    const aActive = a.active ? 1 : 0;
    const bActive = b.active ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const ap = a.match_source ? SOURCE_PRIO[a.match_source] : 0;
    const bp = b.match_source ? SOURCE_PRIO[b.match_source] : 0;
    if (ap !== bp) return bp - ap;
    return a.label.localeCompare(b.label, "da");
  });
}

export function CompanyPrismatrixTable({ companyId }: { companyId: string }) {
  const fn = useServerFn(listPricingForCompany);
  const q = useQuery({
    queryKey: ["pricing-for-company", companyId],
    queryFn: () =>
      fn({ data: { company_id: companyId } }) as Promise<{
        rows: PricingRow[];
        vismaId: string | null;
        kp1: string | null;
        kp2: string | null;
      }>,
    enabled: !!companyId,
  });
  const [search, setSearch] = useState("");
  const [src, setSrc] = useState<MatchSource | "__all__">("__all__");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const rows = q.data?.rows ?? [];
  const sources = useMemo(() => {
    const s = new Set<MatchSource>();
    rows.forEach((r) => r.match_source && s.add(r.match_source));
    return Array.from(s);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (src !== "__all__" && r.match_source !== src) return false;
      if (!t) return true;
      return (
        (r.varenr ?? "").toLowerCase().includes(t) ||
        (r.beskrivelse ?? "").toLowerCase().includes(t) ||
        deriveRowLabel(r).toLowerCase().includes(t)
      );
    });
  }, [rows, search, src]);

  const groups = useMemo(() => buildGroups(filteredRows), [filteredRows]);

  const exportCsv = () => {
    const header = [
      "Match",
      "Kategori",
      "Varenr",
      "Beskrivelse",
      "Rab kr",
      "Rab %",
      "Udsalgspris",
      "Udlejningspris",
      "Kampagne",
      "Fra",
      "Til",
    ];
    const lines = filteredRows.map((r) =>
      [
        r.match_source ?? "",
        r.rabat_kategori ?? "",
        r.varenr ?? "",
        r.beskrivelse ?? "",
        r.rab_kr ?? "",
        r.rab_pct ?? "",
        r.udsalgspris ?? "",
        r.udlejningspris ?? "",
        r.kampagne ?? "",
        r.fra_dato ?? "",
        r.til_dato ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const csv = "\uFEFF" + [header.join(";"), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prismatrix-virksomhed-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (q.isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søg på varenr, beskrivelse eller gruppe"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button
            variant={src === "__all__" ? "default" : "outline"}
            size="sm"
            onClick={() => setSrc("__all__")}
          >
            Alle ({rows.length})
          </Button>
          {sources.map((s) => {
            const n = rows.filter((r) => r.match_source === s).length;
            return (
              <Button
                key={s}
                variant={src === s ? "default" : "outline"}
                size="sm"
                onClick={() => setSrc(s)}
              >
                {SOURCE_LABEL[s]} ({n})
              </Button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filteredRows.length}>
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {rows.length === 0
            ? "Ingen prismatrix-linjer matcher denne virksomheds kundenr / KP1 / KP2."
            : "Ingen rækker matcher filteret."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Match</TableHead>
                <TableHead>Gruppe</TableHead>
                <TableHead>Varenr</TableHead>
                <TableHead className="text-right">Aktiv rabat</TableHead>
                <TableHead className="text-right">Udsalg</TableHead>
                <TableHead>Gyldighed</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => {
                const header = g.active ?? g.future[0] ?? g.expired[0]!;
                const historyCount = g.rows.length - (g.active ? 1 : 0);
                const isOpen = !!expanded[g.key];
                const historyRows = g.rows.filter((r) => r !== g.active);
                return (
                  <Fragment key={g.key}>
                    <TableRow key={g.key} className="bg-muted/20">
                      <TableCell className="align-top">
                        {historyCount > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((e) => ({ ...e, [g.key]: !e[g.key] }))
                            }
                            className="p-1 -m-1 rounded hover:bg-muted"
                            aria-label="Vis historik"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {g.match_source ? SOURCE_LABEL[g.match_source] : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-medium">{g.label}</div>
                        {g.sublabel ? (
                          <div className="text-xs text-muted-foreground">
                            {g.sublabel}
                          </div>
                        ) : null}
                        {header.beskrivelse && header.varenr ? (
                          <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                            {header.beskrivelse}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs align-top">
                        {header.varenr ?? "—"}
                      </TableCell>
                      <TableCell className="text-right align-top font-semibold">
                        {fmtDiscount(header)}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {fmtNum(header.udsalgspris)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top">
                        {fmtDate(header.fra_dato)} → {fmtDate(header.til_dato)}
                      </TableCell>
                      <TableCell className="align-top">
                        {g.active ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                            Aktiv
                          </Badge>
                        ) : g.future.length ? (
                          <Badge variant="outline" className="border-amber-500 text-amber-700">
                            Kommende
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Udløbet
                          </Badge>
                        )}
                        {historyCount > 0 && !isOpen ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((e) => ({ ...e, [g.key]: true }))
                            }
                            className="block mt-1 text-[11px] text-muted-foreground hover:text-foreground underline"
                          >
                            Vis historik ({historyCount})
                          </button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                    {isOpen
                      ? historyRows.map((r) => {
                          const today = format(new Date(), "yyyy-MM-dd");
                          const phase = classifyPhase(r, today);
                          return (
                            <TableRow key={r.id} className="bg-background/40">
                              <TableCell />
                              <TableCell className="text-[10px] text-muted-foreground">
                                ↳
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {phase === "future"
                                  ? `Fra ${fmtDate(r.fra_dato)}`
                                  : phase === "expired"
                                  ? `Udløb ${fmtDate(r.til_dato)}`
                                  : "Også aktiv"}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {r.varenr ?? "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {fmtDiscount(r)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {fmtNum(r.udsalgspris)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {fmtDate(r.fra_dato)} → {fmtDate(r.til_dato)}
                              </TableCell>
                              <TableCell>
                                {phase === "future" ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500 text-amber-700 text-[10px]"
                                  >
                                    Kommende
                                  </Badge>
                                ) : phase === "expired" ? (
                                  <Badge
                                    variant="outline"
                                    className="text-muted-foreground text-[10px]"
                                  >
                                    Udløbet
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    Aktiv
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      : null}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
