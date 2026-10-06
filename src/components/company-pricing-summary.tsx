import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Loader2, Tag } from "lucide-react";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";
import {
  getPrismatrixOverblik,
  deriveRowLabel,
  erBrugbarRabat,
  type PricingRow,
} from "@/lib/agreement-pricing.functions";
import { useViewAs } from "@/contexts/view-as-context";
import { useAuth } from "@/hooks/useAuth";

function fmtDato(d: string | null): string {
  if (!d) return "";
  try {
    return format(parseISO(d), "d. MMM yyyy", { locale: da });
  } catch {
    return d;
  }
}
const n = (x: number) => x.toLocaleString("da-DK", { maximumFractionDigits: 2 });

/** Rabatten i klar tekst. Prismatrixen angiver ingen enhed, så kr.-rabat vises som "kr.". */
function rabatTekst(r: PricingRow): string {
  const saer = Number(r.saerpris_kr ?? 0);
  if (saer > 0) return `Særpris ${n(saer)} kr.`;
  const pct = Number(r.rab_pct ?? 0);
  const kr = Number(r.rab_kr ?? 0);
  const dele: string[] = [];
  if (pct > 0) dele.push(`${n(pct)} %`);
  if (kr > 0) dele.push(`${n(kr)} kr.`);
  return dele.join(" + ") || "—";
}
function gyldighed(r: PricingRow): string {
  if (r.fra_dato && r.til_dato) return `${fmtDato(r.fra_dato)} – ${fmtDato(r.til_dato)}`;
  if (r.fra_dato) return `Fra ${fmtDato(r.fra_dato)}`;
  if (r.til_dato) return `Til ${fmtDato(r.til_dato)}`;
  return "Løbende";
}
const varegruppe = (r: PricingRow) => (r.rabat_kategori ?? "").trim() || "Øvrige";

export function CompanyPricingSummary({ companyId }: { companyId: string }) {
  const fn = useServerFn(getPrismatrixOverblik);
  const { user } = useAuth();
  const visUserId = useViewAs().effectiveUserId ?? user?.id ?? null;
  const [konto, setKonto] = useState<string | null>(null);
  const [visAlle, setVisAlle] = useState(false);

  const q = useQuery({
    queryKey: ["prismatrix-overblik", companyId, konto, visUserId],
    queryFn: () => fn({ data: { company_id: companyId, konto, visUserId } }),
  });

  const idag = new Date().toISOString().slice(0, 10);
  const aktive = useMemo(
    () =>
      (q.data?.rows ?? []).filter(
        (r) => erBrugbarRabat(r) && !(r.til_dato && r.til_dato < idag) && !(r.fra_dato && r.fra_dato > idag),
      ),
    [q.data, idag],
  );
  const top5 = useMemo(() => {
    const oms = q.data?.koebtOmsPrRow ?? {};
    return aktive
      .filter((r) => oms[r.id] > 0)
      .sort((a, b) => oms[b.id] - oms[a.id])
      .slice(0, 5);
  }, [aktive, q.data]);
  const grupper = useMemo(() => {
    const m = new Map<string, PricingRow[]>();
    for (const r of aktive) {
      const g = varegruppe(r);
      m.set(g, [...(m.get(g) ?? []), r]);
    }
    return Array.from(m.entries())
      .map(([g, rs]) => [g, rs.sort((a, b) => deriveRowLabel(a).localeCompare(deriveRowLabel(b), "da"))] as const)
      .sort((a, b) => (a[0] === "Øvrige" ? 1 : b[0] === "Øvrige" ? -1 : a[0].localeCompare(b[0], "da")));
  }, [aktive]);

  if (q.isLoading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Henter prismatrix-rabatter…
      </Card>
    );
  }
  if (q.error) {
    return (
      <Card className="p-4 text-sm text-destructive flex items-center justify-between">
        Kunne ikke hente prismatrix-rabatter.
        <Button size="sm" variant="outline" onClick={() => q.refetch()}>Prøv igen</Button>
      </Card>
    );
  }
  const d = q.data;
  if (!d || (d.rows.length === 0 && d.konti.length <= 1)) return null;

  const fraDatoer = aktive.map((r) => r.fra_dato).filter(Boolean).sort() as string[];
  const kpDel = [d.kp1, d.kp2]
    .filter(Boolean)
    .map((k) => `${k!.kode}${k!.navn ? ` ${k!.navn}` : ""}`)
    .join(" / ");
  const overblik = [
    `${aktive.length} rabataftaler`,
    d.valgt ? `Kundenr. ${d.valgt}` : null,
    kpDel ? `Prisgruppe ${kpDel}` : null,
    fraDatoer[0] ? `Gyldig fra ${fmtDato(fraDatoer[0])}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const Tabel = ({ rows, medGruppe }: { rows: PricingRow[]; medGruppe?: boolean }) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground border-b">
          <th className="py-1.5 pr-2 font-medium">Rabatgruppe/vare</th>
          <th className="py-1.5 px-2 font-medium text-right">Rabat</th>
          <th className="py-1.5 pl-2 font-medium">Gyldighed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b last:border-0 align-top">
            <td className="py-1.5 pr-2">
              {deriveRowLabel(r)}
              {r.varenr && r.varenr !== "0" ? (
                <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{r.varenr}</span>
              ) : null}
              {medGruppe ? <div className="text-xs text-muted-foreground">{varegruppe(r)}</div> : null}
            </td>
            <td className="py-1.5 px-2 text-right font-medium whitespace-nowrap">{rabatTekst(r)}</td>
            <td className="py-1.5 pl-2 text-xs text-muted-foreground whitespace-nowrap">{gyldighed(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Prismatrix-rabatter</h3>
        </div>
        {d.konti.length > 1 && (
          <Select value={d.valgt ?? undefined} onValueChange={(v) => setKonto(v)}>
            <SelectTrigger className="h-8 w-auto min-w-[220px] text-xs">
              <SelectValue placeholder="Vælg konto" />
            </SelectTrigger>
            <SelectContent>
              {d.konti.map((k) => (
                <SelectItem key={k.nr} value={k.nr} className="text-xs">
                  {k.label}
                  {k.egen ? " (din)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <p className="text-sm">{overblik}</p>

      {aktive.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen gældende rabatter på denne konto.</p>
      ) : visAlle ? (
        <div className="space-y-4">
          {grupper.map(([g, rs]) => (
            <div key={g}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{g}</div>
              <Tabel rows={rs} />
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Rabatter på varer købt de seneste 12 mdr.
          </div>
          {top5.length ? (
            <Tabel rows={top5} medGruppe />
          ) : (
            <p className="text-sm text-muted-foreground">Ingen af rabatterne dækker varer købt de seneste 12 mdr.</p>
          )}
        </div>
      )}

      {aktive.length > 0 && (
        <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setVisAlle((v) => !v)}>
          {visAlle ? (
            <>Vis kun købte varer <ChevronUp className="h-3 w-3 ml-1" /></>
          ) : (
            <>Vis alle {aktive.length} rabatter <ChevronDown className="h-3 w-3 ml-1" /></>
          )}
        </Button>
      )}
    </Card>
  );
}
