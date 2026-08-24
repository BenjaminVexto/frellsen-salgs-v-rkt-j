import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Loader2, Boxes, Wrench } from "lucide-react";
import { getSalesForCompany, getUdviklingDetaljer } from "@/lib/sales.functions";
import {
  filterByPeriod,
  fmtKr,
  isMachineGroup,
  monthsAgo,
  currentMonthStart,
  sumRows,
  type SalesMonthlyRow,
} from "@/lib/sales-utils";
import {
  harGyldigtSammenligningsvindue,
  SAMMENLIGNING_UTILGAENGELIG_12MDR,
} from "@/lib/kunde-status";
import { ForbrugSignalSektion } from "@/components/forbrug-signal-sektion";
import type { Location } from "@/components/lokationer-sektion";
import { CategoryBars } from "./category-bars";
import { RevenueSparkline } from "./revenue-sparkline";
import { SalesSignalBox } from "./sales-signal-box";

/** Udviklings-fanen: besøgsforberedelse. Må gerne være tæt på data. */
export function CompanyUdviklingTab({
  companyId,
  locations,
  locationIds,
}: {
  companyId: string;
  locations: Location[];
  locationIds?: string[];
}) {
  const fetchSales = useServerFn(getSalesForCompany);
  const fetchDetaljer = useServerFn(getUdviklingDetaljer);

  const salesQ = useQuery({
    queryKey: ["sales-company", companyId],
    queryFn: () => fetchSales({ data: { companyId } }),
  });
  const detQ = useQuery({
    queryKey: ["udvikling-detaljer", companyId],
    queryFn: () => fetchDetaljer({ data: { companyId } }),
  });

  if (salesQ.isLoading) {
    return (
      <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Henter udviklingsdata…
      </Card>
    );
  }
  if (salesQ.error) {
    return <Card className="p-5 text-sm text-destructive">Kunne ikke hente udviklingsdata.</Card>;
  }

  const rows: SalesMonthlyRow[] = salesQ.data?.rows ?? [];
  const isAdmin = !!salesQ.data?.isAdmin;
  const nu = currentMonthStart();
  const rows12 = filterByPeriod(rows, monthsAgo(12), nu);

  return (
    <div className="space-y-4">
      <ForbrugSignalSektion companyId={companyId} locations={locations} />

      <SortimentsbreddeKort
        loading={detQ.isLoading}
        data={detQ.data}
      />

      <MaskinerTeknikKort rows={rows12} isAdmin={isAdmin} buckets={detQ.data?.maskinBuckets ?? []} />

      <CategoryBars
        rows={rows12}
        title="Kategorifordeling (12 mdr.)"
        companyId={companyId}
        gruppeNavne={detQ.data?.gruppeNavne}
      />

      <RevenueSparkline rows={rows} locationIds={locationIds} />

      <SalesSignalBox rows={rows} />

      <p className="text-xs text-muted-foreground">
        Sammenligninger på denne fane er 6 hele måneder mod samme 6 måneder året før. Den
        igangværende måned indgår ikke.
      </p>
    </div>
  );
}

function Diff({
  nu,
  foer,
  gyldigt,
  aarsag,
}: {
  nu: number;
  foer: number;
  gyldigt: boolean;
  aarsag?: string;
}) {
  if (!gyldigt) {
    return (
      <span className="text-xs text-muted-foreground">
        {aarsag ?? SAMMENLIGNING_UTILGAENGELIG_12MDR}
      </span>
    );
  }
  const d = nu - foer;
  const cls = d < 0 ? "text-destructive" : d > 0 ? "text-success" : "text-muted-foreground";
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {d > 0 ? "+" : ""}
      {d} vs. samme 6 mdr. året før ({foer})
    </span>
  );
}

function SortimentsbreddeKort({
  loading,
  data,
}: {
  loading: boolean;
  data?: {
    vindueFoerFra: string;
    foerDaekket: boolean;
    varelinjeStart: string | null;
    sortimentForbrug: { nu: number; foer: number };
    sortimentMaskine: { nu: number; foer: number };
  };
}) {
  const startTekst = (() => {
    if (!data || data.foerDaekket) return null;
    if (!data.varelinjeStart) return "Ingen varelinje-historik registreret endnu.";
    const start = new Date(data.varelinjeStart + "T00:00:00Z");
    const klar = new Date(
      Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth() + 6, 1),
    );
    const f = (d: Date) => d.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
    return `Varelinje-historik starter ${f(start)} — sammenligning mulig fra ${f(klar)}.`;
  })();
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <Boxes className="h-4 w-4" /> Sortimentsbredde
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Antal aktive varenumre seneste 6 hele måneder mod samme 6 måneder året før. Falder bredden,
        er kunden begyndt at købe noget andet steds — ofte længe før kaffen forsvinder.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter…
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Ingen varedata registreret.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: "Forbrugsvarer", t: data.sortimentForbrug },
            { label: "Maskiner & teknik", t: data.sortimentMaskine },
          ].map((x) => {
            const gyldigt =
              harGyldigtSammenligningsvindue(data.vindueFoerFra) && data.foerDaekket;
            return (
              <div key={x.label} className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">{x.label}</div>
                <div className="text-2xl font-semibold tabular-nums">{x.t.nu}</div>
                <Diff
                  nu={x.t.nu}
                  foer={x.t.foer}
                  gyldigt={gyldigt}
                  aarsag={
                    !data.foerDaekket
                      ? "Ingen varelinjer for samme 6 måneder året før — vist uden sammenligning."
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">
        Baseret på registrerede varelinjer pr. måned.
      </p>
    </Card>
  );
}

function MaskinerTeknikKort({
  rows,
  isAdmin,
  buckets,
}: {
  rows: SalesMonthlyRow[];
  isAdmin: boolean;
  buckets: { navn: string; revenue: number; contribution: number | null }[];
}) {
  const maskinRows = rows.filter((r) => isMachineGroup(r.product_group_1));
  const sum = sumRows(maskinRows);
  const erArbejdstimer = (navn: string) => /montør|service|time/i.test(navn);
  const timerDb = buckets
    .filter((b) => erArbejdstimer(b.navn))
    .reduce((s, b) => s + (b.contribution ?? 0), 0);
  const dgTekst = (rev: number, db: number | null) =>
    db != null && rev > 0 ? ` (${((db / rev) * 100).toFixed(0)} %)` : "";


  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <Wrench className="h-4 w-4" /> Maskiner &amp; teknik (12 mdr.)
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Varegruppe 16, 17, 18 og 24. Indgår aldrig i forbrugstal.
      </p>
      {maskinRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Intet salg af maskiner eller teknik.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-muted-foreground">Omsætning</div>
              <div className="text-xl font-semibold tabular-nums">{fmtKr(sum.revenue)}</div>
            </div>
            {isAdmin && sum.contribution != null && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground">Dækningsbidrag</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {fmtKr(sum.contribution)}
                    {dgTekst(sum.revenue, sum.contribution)}
                  </div>
                </div>
                {timerDb > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground">DB uden montørtimer</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {fmtKr(sum.contribution - timerDb)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {buckets.length > 0 && (
            <ul className="mt-4 divide-y text-sm">
              {buckets.map((b) => (
                <li key={b.navn} className="py-2 flex items-baseline justify-between gap-3">
                  <span className="truncate">{b.navn}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {fmtKr(b.revenue)}
                    {isAdmin && b.contribution != null
                      ? ` · DB ${fmtKr(b.contribution)}${dgTekst(b.revenue, b.contribution)}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">
            Leje og montørtimer er udskilt ud fra varelinjernes tekst. Arbejdstimer har ingen
            registreret kostpris, så deres dækningsbidrag svarer til omsætningen (100 %) og
            trækker den samlede maskin-DG kunstigt op.
          </p>
        </>
      )}
    </Card>
  );
}
