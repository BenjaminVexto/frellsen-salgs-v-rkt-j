import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listProducts,
  updateProductSalesFields,
  KATEGORI_VALUES,
  type ProductRow,
} from "@/lib/products.functions";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/tilbudskatalog")({
  head: () => ({ meta: [{ title: "Tilbudskatalog — Admin" }] }),
  component: TilbudskatalogPage,
});

type Filter = "alle" | "tilbudsegnede" | "udgaaede";

function formatKr(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("da-DK", { style: "currency", currency: "DKK" });
}

const KATEGORI_LABEL: Record<string, string> = {
  kaffe: "Kaffe",
  te: "Te",
  chokolade: "Chokolade",
  maelk: "Mælk",
  maskine: "Maskine",
  tilbehoer: "Tilbehør",
  ovrigt: "Øvrigt",
};

function TilbudskatalogPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && auth.session && auth.role !== "admin") {
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.session, auth.role, navigate]);

  const list = useServerFn(listProducts);
  const update = useServerFn(updateProductSalesFields);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => list(),
  });

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof update>[0]["data"]) =>
      update({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "products"] }),
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke gemme"),
  });

  const [filter, setFilter] = useState<Filter>("alle");
  const [search, setSearch] = useState("");
  const [openVarenr, setOpenVarenr] = useState<string | null>(null);

  const rows = (query.data ?? []) as ProductRow[];

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "tilbudsegnede" && !r.is_tilbudsegnet) return false;
      if (filter === "udgaaede" && r.record_status !== "udgaaet") return false;
      if (filter === "alle" && r.record_status === "udgaaet") {
        // alle = aktive; brug "udgåede" for at se de gamle
        return false;
      }
      if (!s) return true;
      return (
        r.varenr.toLowerCase().includes(s) ||
        (r.beskrivelse ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, filter, search]);

  const stats = useMemo(() => {
    const aktive = rows.filter((r) => r.record_status === "aktiv").length;
    const tilbud = rows.filter((r) => r.is_tilbudsegnet).length;
    const udg = rows.filter((r) => r.record_status === "udgaaet").length;
    return { aktive, tilbud, udg, total: rows.length };
  }, [rows]);

  const openRow = openVarenr
    ? rows.find((r) => r.varenr === openVarenr) ?? null
    : null;

  if (auth.role !== "admin") return null;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tilbudskatalog</h1>
          <p className="text-sm text-muted-foreground">
            Kurater hvilke varer der må bruges i tilbud, og overstyr kategori
            og salgstekst. Ændringer her bevares ved gen-import fra Visma.
          </p>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <div>
            <div className="text-xs uppercase tracking-wide">I alt</div>
            <div className="text-lg font-medium text-foreground">{stats.total}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide">Aktive</div>
            <div className="text-lg font-medium text-foreground">{stats.aktive}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide">Tilbudsegnede</div>
            <div className="text-lg font-medium text-primary">{stats.tilbud}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide">Udgåede</div>
            <div className="text-lg font-medium text-foreground">{stats.udg}</div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[280px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søg varenr eller beskrivelse…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="inline-flex rounded-md border bg-card overflow-hidden text-sm">
          {([
            ["alle", "Alle aktive"],
            ["tilbudsegnede", "Kun tilbudsegnede"],
            ["udgaaede", "Udgåede"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 ${
                filter === k
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          Viser {filtered.length} af {rows.length}
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        <div className="text-destructive">
          Kunne ikke hente produkter: {(query.error as any)?.message}
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Varenr</TableHead>
                <TableHead>Beskrivelse</TableHead>
                <TableHead className="w-[170px]">Kategori</TableHead>
                <TableHead className="w-[110px] text-right">Listepris</TableHead>
                <TableHead className="w-[80px]">Leje</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[130px] text-center">
                  Tilbudsegnet
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const erUdgaaet = r.record_status === "udgaaet";
                return (
                  <TableRow
                    key={r.varenr}
                    className={`cursor-pointer ${
                      erUdgaaet ? "opacity-50" : ""
                    }`}
                    onClick={() => setOpenVarenr(r.varenr)}
                  >
                    <TableCell className="font-mono text-xs">
                      {r.varenr}
                    </TableCell>
                    <TableCell>
                      <div className="line-clamp-1">{r.beskrivelse ?? "—"}</div>
                      {r.salgsbeskrivelse && (
                        <div className="text-xs text-primary line-clamp-1">
                          {r.salgsbeskrivelse}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span>{KATEGORI_LABEL[r.kategori ?? "ovrigt"] ?? r.kategori}</span>
                        {r.kategori_manuel && (
                          <Badge variant="secondary" className="text-[10px]">
                            manuel
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatKr(r.listepris)}
                    </TableCell>
                    <TableCell>
                      {r.kan_lejes ? (
                        <Badge variant="outline">Leje</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {erUdgaaet ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Udgået
                        </Badge>
                      ) : (
                        <Badge variant="outline">Aktiv</Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Switch
                        checked={r.is_tilbudsegnet}
                        disabled={erUdgaaet || mutation.isPending}
                        onCheckedChange={(v) =>
                          mutation.mutate({
                            varenr: r.varenr,
                            is_tilbudsegnet: v,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    Ingen varer matcher filteret
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <EditSheet
        row={openRow}
        onClose={() => setOpenVarenr(null)}
        onSave={(p) => mutation.mutate(p)}
        saving={mutation.isPending}
      />
    </div>
  );
}

function EditSheet({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: ProductRow | null;
  onClose: () => void;
  onSave: (p: any) => void;
  saving: boolean;
}) {
  const [kategori, setKategori] = useState<string>("");
  const [salgsbeskrivelse, setSalgsbeskrivelse] = useState("");
  const [sortOrder, setSortOrder] = useState<string>("");
  const [isTilbud, setIsTilbud] = useState(false);

  useEffect(() => {
    if (!row) return;
    setKategori(row.kategori ?? "ovrigt");
    setSalgsbeskrivelse(row.salgsbeskrivelse ?? "");
    setSortOrder(row.sort_order != null ? String(row.sort_order) : "");
    setIsTilbud(row.is_tilbudsegnet);
  }, [row?.varenr]);

  if (!row) return null;
  const erUdgaaet = row.record_status === "udgaaet";

  const handleSave = () => {
    const sortNum = sortOrder.trim() === "" ? null : Number(sortOrder);
    if (sortNum !== null && (!Number.isFinite(sortNum) || !Number.isInteger(sortNum))) {
      toast.error("Sortering skal være et heltal");
      return;
    }
    onSave({
      varenr: row.varenr,
      is_tilbudsegnet: erUdgaaet ? false : isTilbud,
      kategori: kategori as any,
      salgsbeskrivelse: salgsbeskrivelse.trim() === "" ? null : salgsbeskrivelse,
      sort_order: sortNum,
    });
    onClose();
  };

  const handleResetKategori = () => {
    onSave({ varenr: row.varenr, kategori_reset: true });
    onClose();
  };

  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row.beskrivelse ?? row.varenr}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            Varenr {row.varenr} · {row.kilde === "prismatrix" ? "Aktiv i prismatrix" : "Kun historik"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <section className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Produktprisgruppe 1</span><span>{row.produktprisgruppe_1 ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Produktprisgruppe 2</span><span>{row.produktprisgruppe_2 ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Listepris</span><span className="tabular-nums">{formatKr(row.listepris)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Udlejningspris</span><span className="tabular-nums">{formatKr(row.udlejningspris)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Kan lejes</span><span>{row.kan_lejes ? "Ja" : "Nej"}</span></div>
          </section>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center justify-between">
              <span>Tilbudsegnet</span>
              <Switch
                checked={isTilbud}
                disabled={erUdgaaet}
                onCheckedChange={setIsTilbud}
              />
            </label>
            {erUdgaaet && (
              <p className="text-xs text-muted-foreground">
                Udgåede varer kan ikke sættes som tilbudsegnede.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Kategori</label>
            <div className="flex gap-2">
              <Select value={kategori} onValueChange={setKategori}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KATEGORI_VALUES.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KATEGORI_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {row.kategori_manuel && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Nulstil til auto-afledt kategori"
                  onClick={handleResetKategori}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {row.kategori_manuel
                ? "Manuelt sat — bevares ved gen-import. Tryk pilen for at lade systemet udlede den igen."
                : "Auto-afledt fra Visma-grupper. Vælger du en anden, vinder dit valg over fremtidige imports."}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Salgsbeskrivelse</label>
            <Textarea
              value={salgsbeskrivelse}
              onChange={(e) => setSalgsbeskrivelse(e.target.value)}
              placeholder="Kort tekst der vises i tilbuddet — fx 'Vores bedst sælgende espresso, mild og rund.'"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Sortering</label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="Lavt tal vises først"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Annullér
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gem
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
