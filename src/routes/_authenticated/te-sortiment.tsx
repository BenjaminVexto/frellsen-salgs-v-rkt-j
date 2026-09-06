import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Check, Leaf, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAfdeling } from "@/contexts/afdeling-context";
import {
  getTeSortimentOversigt,
  teTypeLabel,
  type TeOversigtRaekke,
} from "@/lib/te-sortiment.functions";

export const Route = createFileRoute("/_authenticated/te-sortiment")({
  component: TeSortimentSide,
  head: () => ({
    meta: [
      { title: "Te-sortiment · Java Brænderiet" },
      {
        name: "description",
        content:
          "Overblik over hvilke tetyper hver butik i Java Brænderiet fører, og hvor hullerne i sortimentet er.",
      },
      { property: "og:title", content: "Te-sortiment · Java Brænderiet" },
      {
        property: "og:description",
        content: "Se kg te pr. butik og hvilke tetyper der mangler i sortimentet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function kg(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("da-DK", { maximumFractionDigits: 1 });
}

function TeSortimentSide() {
  const auth = useAuth();
  const afd = useAfdeling();
  const hent = useServerFn(getTeSortimentOversigt);

  const harAdgang = auth.afdelinger.includes(21);
  const afdValgt = afd.afdelingFilter === 21;
  const enabled = harAdgang && afdValgt;

  const { data, isLoading } = useQuery({
    queryKey: ["te-sortiment-oversigt"],
    queryFn: () => hent(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const [soeg, setSoeg] = useState("");
  const [kpFilter, setKpFilter] = useState<string>("alle");
  const [saelgerFilter, setSaelgerFilter] = useState<string>("alle");
  const [manglerTyper, setManglerTyper] = useState<string[]>([]);

  const raekker: TeOversigtRaekke[] = data ?? [];

  const typer = useMemo(() => {
    const s = new Set<string>();
    for (const r of raekker) for (const t of Object.keys(r.kg_pr_type ?? {})) s.add(t);
    const kendte = [...s].filter((t) => t !== "ukendt").sort((a, b) =>
      teTypeLabel(a).localeCompare(teTypeLabel(b), "da-DK"),
    );
    return s.has("ukendt") ? [...kendte, "ukendt"] : kendte;
  }, [raekker]);

  const kpGrupper = useMemo(
    () =>
      [...new Set(raekker.map((r) => (r.customer_segment_1 ?? "").trim()).filter(Boolean))].sort(),
    [raekker],
  );
  const saelgere = useMemo(
    () => [...new Set(raekker.map((r) => r.saelger).filter(Boolean) as string[])].sort((a, b) =>
      a.localeCompare(b, "da-DK"),
    ),
    [raekker],
  );

  const filtreret = useMemo(() => {
    const q = soeg.trim().toLowerCase();
    return raekker
      .filter((r) => (q ? r.name.toLowerCase().includes(q) : true))
      .filter((r) => (kpFilter === "alle" ? true : (r.customer_segment_1 ?? "").trim() === kpFilter))
      .filter((r) =>
        saelgerFilter === "alle"
          ? true
          : saelgerFilter === "__ingen"
            ? !r.saelger
            : r.saelger === saelgerFilter,
      )
      .filter((r) =>
        manglerTyper.length === 0
          ? true
          : manglerTyper.every((t) => !Number((r.kg_pr_type ?? {})[t] ?? 0)),
      )
      .sort((a, b) => Number(b.kg_total ?? 0) - Number(a.kg_total ?? 0));
  }, [raekker, soeg, kpFilter, saelgerFilter, manglerTyper]);

  if (!harAdgang) {
    return (
      <div className="p-6">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            Siden er kun for brugere med adgang til Java Brænderiet.
          </p>
        </Card>
      </div>
    );
  }

  if (!afdValgt) {
    return (
      <div className="p-6">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            Vælg Java Brænderiet i afdelingsvælgeren øverst for at se te-sortimentet.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Leaf className="h-5 w-5" /> Te-sortiment
        </h1>
        <p className="text-sm text-muted-foreground">
          Butikker med tekøb de seneste 12 måneder. Sorteret efter kg te, så de største butikker med
          huller står øverst.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Søg kunde…"
            value={soeg}
            onChange={(e) => setSoeg(e.target.value)}
            className="w-56"
          />
          <Select value={kpFilter} onValueChange={setKpFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Kundeprisgruppe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle kundeprisgrupper</SelectItem>
              {kpGrupper.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={saelgerFilter} onValueChange={setSaelgerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sælger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle sælgere</SelectItem>
              <SelectItem value="__ingen">Uden sælger</SelectItem>
              {saelgere.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1.5">
            Mangler type — vælg en eller flere typer for kun at se butikker uden dem
          </p>
          <div className="flex flex-wrap gap-1.5">
            {typer
              .filter((t) => t !== "ukendt")
              .map((t) => {
                const valgt = manglerTyper.includes(t);
                return (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={valgt ? "default" : "outline"}
                    onClick={() =>
                      setManglerTyper((prev) =>
                        prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                      )
                    }
                  >
                    {teTypeLabel(t)}
                  </Button>
                );
              })}
            {manglerTyper.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setManglerTyper([])}>
                Nulstil
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter …
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kunde</TableHead>
                <TableHead>Sælger</TableHead>
                <TableHead className="text-right">kg te</TableHead>
                {typer.map((t) => (
                  <TableHead key={t} className="text-center whitespace-nowrap">
                    {teTypeLabel(t)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtreret.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3 + typer.length} className="text-sm text-muted-foreground">
                    Ingen butikker matcher filtrene.
                  </TableCell>
                </TableRow>
              )}
              {filtreret.map((r) => (
                <TableRow key={r.company_id}>
                  <TableCell>
                    <Link
                      to="/virksomheder/$id"
                      params={{ id: r.company_id }}
                      className="hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.customer_segment_1 && (
                      <Badge variant="secondary" className="ml-2 text-xs font-normal">
                        {r.customer_segment_1}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.saelger ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{kg(r.kg_total)}</TableCell>
                  {typer.map((t) => {
                    const v = Number((r.kg_pr_type ?? {})[t] ?? 0);
                    return (
                      <TableCell key={t} className="text-center">
                        {v > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs tabular-nums"
                            title={`${kg(v)} kg`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            {kg(v)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
