import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Loader2, Boxes, Wrench, Receipt, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getSalesForCompany, getUdviklingDetaljer } from "@/lib/sales.functions";
import {
  filterByPeriod,
  fmtKr,
  gruppeKodeOf,
  monthsAgo,
  currentMonthStart,
  sumRows,
  type SalesMonthlyRow,
} from "@/lib/sales-utils";
import { harGyldigtSammenligningsvindue } from "@/lib/kunde-status";
import { ForbrugSignalSektion } from "@/components/forbrug-signal-sektion";
import type { Location } from "@/components/lokationer-sektion";
import { CategoryBars } from "./category-bars";
import { RevenueSparkline } from "./revenue-sparkline";
import { SalesSignalBox } from "./sales-signal-box";

const TEKNIK_KODER = new Set(["16", "17", "18"]);
const GEBYR_KODE = "24";

/** Udviklings-fanen: besøgsforberedelse. Må gerne være tæt på data. */
export function CompanyUdviklingTab({
  companyId,
  locations,
  locationIds,
  skjulSignaler,
}: {
  companyId: string;
  locations: Location[];
  locationIds?: string[];
  /** Afløst debitorpost: forbrugssignal og advarsler skjules. */
  skjulSignaler?: boolean;
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

  const teknikRows = rows12.filter((r) => {
    const k = gruppeKodeOf(r.product_group_1);
    return !!k && TEKNIK_KODER.has(k);
  });
  const gebyrRows = rows12.filter((r) => gruppeKodeOf(r.product_group_1) === GEBYR_KODE);
  const gebyrSum = sumRows(gebyrRows);
  const teknikBuckets = (detQ.data?.maskinBuckets ?? []).filter((b) => !/gebyr|fragt|bonus/i.test(b.navn));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Alle sammenligninger er de seneste 6 hele måneder mod samme 6 måneder året før. Den
        igangværende måned indgår ikke.
      </p>

      {!skjulSignaler && (
        <ForbrugSignalSektion companyId={companyId} locations={locations} />
      )}

      <RevenueSparkline rows={rows} locationIds={locationIds} />

      <CategoryBars
        rows={rows12}
        title="Kategorifordeling (12 mdr.)"
        companyId={companyId}
        gruppeNavne={detQ.data?.gruppeNavne}
      />

      <SortimentsbreddeKort loading={detQ.isLoading} data={detQ.data} />

      {teknikRows.length > 0 && (
        <MaskinerTeknikKort rows={teknikRows} isAdmin={isAdmin} buckets={teknikBuckets} />
      )}

      {gebyrRows.length > 0 && gebyrSum.revenue !== 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
            <Receipt className="h-4 w-4" /> Gebyrer, fragt &amp; bonus (12 mdr.)
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Varegruppe 24.</p>
          <div className="text-xl font-semibold tabular-nums">{fmtKr(gebyrSum.revenue)}</div>
          {gebyrSum.revenue < 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Negativt beløb betyder udbetalt bonus eller krediteret fragt.
            </p>
          )}
        </Card>
      )}

      {!skjulSignaler && <SalesSignalBox rows={rows} />}
    </div>
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
  const gyldigt =
    !!data && data.foerDaekket && harGyldigtSammenligningsvindue(data.vindueFoerFra);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <Boxes className="h-4 w-4" /> Sortimentsbredde
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Antal aktive varenumre. Falder bredden, er kunden begyndt at købe noget andet steds — ofte
        længe før kaffen forsvinder.
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
            const d = x.t.nu - x.t.foer;
            const cls =
              d < 0 ? "text-destructive" : d > 0 ? "text-success" : "text-muted-foreground";
            return (
              <div key={x.label} className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">{x.label}</div>
                <div className="text-2xl font-semibold tabular-nums">{x.t.nu}</div>
                {gyldigt ? (
                  <span className={`text-xs font-medium ${cls}`}>
                    {d > 0 ? "+" : ""}
                    {d} vs. samme 6 mdr. året før ({x.t.foer})
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Ingen sammenligning endnu — kræver 12 måneders historik
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
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
  const sum = sumRows(rows);
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
        <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Om beregningen" className="text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Leje og montørtimer er udskilt ud fra varelinjernes tekst. Arbejdstimer har ingen
            registreret kostpris, så deres dækningsbidrag svarer til omsætningen (100 %) og trækker
            den samlede maskin-DG kunstigt op.
          </TooltipContent>
        </Tooltip>
        </TooltipProvider>
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Varegruppe 16, 17 og 18. Indgår aldrig i forbrugstal.
      </p>
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
    </Card>
  );
}

