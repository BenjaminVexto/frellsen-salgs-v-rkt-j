import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { listPricingByKp1, listPricingByKp2 } from "@/lib/agreement-pricing.functions";

type Row = {
  id: string;
  rabat_kategori: string | null;
  beskrivelse: string | null;
  varenr: string | null;
  rab_kr: number | null;
  rab_pct: number | null;
  udsalgspris: number | null;
  udlejningspris: number | null;
  kampagne: string | null;
  fra_dato: string | null;
  til_dato: string | null;
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

export function PrismatrixTable({ kp2 }: { kp2: string }) {
  const fn = useServerFn(listPricingByKp2);
  const q = useQuery({
    queryKey: ["pricing-by-kp2", kp2],
    queryFn: () => fn({ data: { kp2 } }) as Promise<Row[]>,
    enabled: !!kp2,
  });
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("__all__");

  const rows = q.data ?? [];
  const categories = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.rabat_kategori ?? "Øvrige"));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== "__all__" && (r.rabat_kategori ?? "Øvrige") !== cat) return false;
      if (!t) return true;
      return (
        (r.varenr ?? "").toLowerCase().includes(t) ||
        (r.beskrivelse ?? "").toLowerCase().includes(t)
      );
    });
  }, [rows, search, cat]);

  const exportCsv = () => {
    const header = [
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
    a.download = `prismatrix-kp2-${kp2}.csv`;
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
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
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
            variant={cat === "__all__" ? "default" : "outline"}
            size="sm"
            onClick={() => setCat("__all__")}
          >
            Alle ({rows.length})
          </Button>
          {categories.map((c) => {
            const n = rows.filter((r) => (r.rabat_kategori ?? "Øvrige") === c).length;
            return (
              <Button
                key={c}
                variant={cat === c ? "default" : "outline"}
                size="sm"
                onClick={() => setCat(c)}
              >
                {c} ({n})
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
            ? "Ingen prismatrix-linjer for denne kundeprisgruppe."
            : "Ingen rækker matcher filteret."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kategori</TableHead>
                <TableHead>Varenr</TableHead>
                <TableHead>Beskrivelse</TableHead>
                <TableHead className="text-right">Rab kr</TableHead>
                <TableHead className="text-right">Rab %</TableHead>
                <TableHead className="text-right">Udsalg</TableHead>
                <TableHead className="text-right">Udlejning</TableHead>
                <TableHead>Kampagne</TableHead>
                <TableHead>Gyldighed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {r.rabat_kategori ?? "Øvrige"}
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
                  <TableCell className="text-right">{fmtNum(r.udlejningspris)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                    {r.kampagne ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.fra_dato)} → {fmtDate(r.til_dato)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
