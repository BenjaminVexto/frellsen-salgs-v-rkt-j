import { useMemo, useState } from "react";
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
import { Search, Loader2, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  listPricingForCompany,
  deriveRowLabel,
  type MatchSource,
  type PricingRow,
} from "@/lib/agreement-pricing.functions";

const SOURCE_LABEL: Record<MatchSource, string> = {
  kundenr: "Kundenr",
  "kp1+kp2": "KP1+KP2",
  kp1: "KP1",
  kp2: "KP2",
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

  const rows = q.data?.rows ?? [];
  const sources = useMemo(() => {
    const s = new Set<MatchSource>();
    rows.forEach((r) => r.match_source && s.add(r.match_source));
    return Array.from(s);
  }, [rows]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (src !== "__all__" && r.match_source !== src) return false;
      if (!t) return true;
      return (
        (r.varenr ?? "").toLowerCase().includes(t) ||
        (r.beskrivelse ?? "").toLowerCase().includes(t)
      );
    });
  }, [rows, search, src]);

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
    const lines = filtered.map((r) =>
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
            placeholder="Søg på varenr eller beskrivelse"
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
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
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
                <TableHead>Match</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Varenr</TableHead>
                <TableHead>Beskrivelse</TableHead>
                <TableHead className="text-right">Rab kr</TableHead>
                <TableHead className="text-right">Rab %</TableHead>
                <TableHead className="text-right">Udsalg</TableHead>
                <TableHead>Gyldighed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {r.match_source ? SOURCE_LABEL[r.match_source] : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {deriveRowLabel(r)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.varenr ?? "—"}</TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {r.beskrivelse ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{fmtNum(r.rab_kr)}</TableCell>
                  <TableCell className="text-right">
                    {r.rab_pct != null ? `${fmtNum(r.rab_pct)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">{fmtNum(r.udsalgspris)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.fra_dato)} → {fmtDate(r.til_dato)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
