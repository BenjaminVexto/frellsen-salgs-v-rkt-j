import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import {
  fmtKg,
  fmtKr,
  gruppeKodeOf,
  gruppeValgmuligheder,
  isConsumableGroup,
  KAFFE_KODE,
  kodeLabel,
  type SalesMonthlyRow,
} from "@/lib/sales-utils";
import { getMonthlyConsumableProducts } from "@/lib/sales.functions";

const ALLE = "ALLE";
type Enhed = "kg" | "kr";

function serie(rows: SalesMonthlyRow[], months: number, kode: string, enhed: Enhed) {
  const out: { period: string; label: string; value: number }[] = [];
  const now = new Date();
  // Kun hele måneder — den igangværende måned indgår ikke.
  for (let i = months; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    out.push({
      period,
      label: d.toLocaleDateString("da-DK", { month: "short" }),
      value: 0,
    });
  }
  const idx = new Map(out.map((o, i) => [o.period, i]));
  for (const r of rows) {
    const match =
      kode === ALLE
        ? isConsumableGroup(r.product_group_1)
        : gruppeKodeOf(r.product_group_1) === kode;
    if (!match) continue;
    const i = idx.get(r.period);
    if (i != null)
      out[i].value += (enhed === "kg" ? Number(r.weight_kg) : Number(r.revenue)) || 0;
  }
  return out;
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + "T00:00:00Z");
  return d.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
}

export function ConsumableKgChart({
  rows,
  months = 18,
  locationIds,
  gruppeNavne,
}: {
  rows: SalesMonthlyRow[];
  months?: number;
  locationIds?: string[];
  gruppeNavne?: Record<string, string>;
}) {
  const valg = useMemo(() => gruppeValgmuligheder(rows), [rows]);
  // Kaffe som standard; ellers kundens største gruppe.
  const defaultKode = valg.includes(KAFFE_KODE) ? KAFFE_KODE : (valg[0] ?? KAFFE_KODE);
  const [kode, setKode] = useState<string | null>(null);
  const aktivKode = kode ?? defaultKode;
  const [enhed, setEnhed] = useState<Enhed>("kg");

  const fmtVal = (n: number) => (enhed === "kg" ? fmtKg(n, 1) : fmtKr(n));

  // Maskiner/teknik registreres uden vægt.
  const erMaskinTeknik = MASKIN_TEKNIK_KODER.has(aktivKode);
  const kgSerie = useMemo(() => serie(rows, months, aktivKode, "kg"), [rows, months, aktivKode]);
  const harKgIPerioden = kgSerie.some((d) => d.value > 0);
  const kgDeaktiveret = erMaskinTeknik;
  const effektivEnhed: Enhed = kgDeaktiveret ? "kr" : enhed;

  const data = useMemo(
    () => serie(rows, months, aktivKode, effektivEnhed),
    [rows, months, aktivKode, effektivEnhed],
  );
  const tomKg = effektivEnhed === "kg" && !harKgIPerioden;
  const visData = tomKg ? [] : data;
  const max = Math.max(1, ...visData.map((d) => d.value));
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const clickable = !!locationIds && locationIds.length > 0 && !tomKg;

  const fetchFn = useServerFn(getMonthlyConsumableProducts);
  const varerQ = useQuery({
    queryKey: [
      "monthly-consumable-products",
      openPeriod,
      aktivKode,
      effektivEnhed,
      locationIds?.slice().sort().join(","),
    ],
    queryFn: () =>
      fetchFn({
        data: {
          locationIds: locationIds ?? [],
          period: openPeriod!,
          gruppeKode: aktivKode === ALLE ? null : aktivKode,
          enhed: effektivEnhed,
        },
      }),
    enabled: !!openPeriod && clickable,
  });
  const varer = useMemo(() => varerQ.data ?? [], [varerQ.data]);
  const harKg = varer.some((v) => v.weightKg > 0);
  const grafSum = openPeriod ? (data.find((d) => d.period === openPeriod)?.value ?? 0) : 0;
  const linjeSum = varer.reduce(
    (s, v) => s + (effektivEnhed === "kg" ? v.weightKg : v.revenue),
    0,
  );
  const afviger = grafSum > 0 && Math.abs(grafSum - linjeSum) > Math.max(1, grafSum * 0.005);
  const daekningsTekst = `Varelinjerne dækker ${fmtVal(linjeSum)} af ${fmtVal(grafSum)} for måneden — resten mangler varelinje-historik.`;

  const gruppeNavnAktiv = aktivKode === ALLE ? "I alt" : kodeLabel(aktivKode, gruppeNavne);
  const titel =
    aktivKode === ALLE
      ? "I alt pr. måned"
      : aktivKode === KAFFE_KODE
        ? effektivEnhed === "kg"
          ? "Kg kaffe pr. måned"
          : "Kr. kaffe pr. måned"
        : `${effektivEnhed === "kg" ? "Kg" : "Kr."} ${gruppeNavnAktiv.toLowerCase()} pr. måned`;

  const vaelgGruppe = (k: string) => {
    setKode(k);
    // Kilo på tværs af grupper kan ikke sammenlignes.
    if (k === ALLE) setEnhed("kr");
    if (MASKIN_TEKNIK_KODER.has(k)) setEnhed("kr");
  };


  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{titel}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Seneste {months} hele måneder. Tomme måneder er normalt hos kunder, der bestiller i partier.
              {clickable ? " Klik på en søjle for at se varelinjerne." : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {[ALLE, ...valg].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => vaelgGruppe(k)}
                  className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${
                    k === aktivKode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {k === ALLE ? "I alt" : kodeLabel(k, gruppeNavne)}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["kg", "kr"] as Enhed[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnhed(e)}
                  className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${
                    e === enhed
                      ? "bg-secondary text-secondary-foreground border-secondary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 h-36 mt-3">
          {data.map((d) => (
            <div key={d.period} className="flex-1 flex flex-col items-center gap-1 h-full">
              <div className="flex-1 w-full flex items-end min-h-0">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && setOpenPeriod(d.period)}
                  className={`w-full bg-primary/60 rounded-t transition-colors ${
                    clickable ? "cursor-pointer hover:bg-primary" : "cursor-default"
                  }`}
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
                  title={`${d.label}: ${fmtVal(d.value)}${clickable ? " — klik for varelinjer" : ""}`}
                  aria-label={`${d.label}: ${fmtVal(d.value)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Den igangværende måned indgår ikke.
        </p>
      </Card>



      <Dialog open={!!openPeriod} onOpenChange={(o) => !o && setOpenPeriod(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {gruppeNavnAktiv} · {openPeriod ? formatPeriodLabel(openPeriod) : ""}
            </DialogTitle>
          </DialogHeader>
          {varerQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Henter…
            </div>
          ) : varerQ.error ? (
            <p className="text-sm text-destructive py-4">Kunne ikke hente varelinjer.</p>
          ) : varer.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {aktivKode === ALLE
                ? `Ingen forbrugsvarer købt i ${openPeriod ? formatPeriodLabel(openPeriod) : "denne måned"}.`
                : `Ingen køb i denne gruppe i ${openPeriod ? formatPeriodLabel(openPeriod) : "denne måned"}.`}
            </p>

          ) : (
            <>
              <ul className="divide-y text-sm max-h-[60vh] overflow-y-auto">
                {varer.map((v) => (
                  <li key={v.varenr} className="py-2 flex items-baseline justify-between gap-3">
                    <span className="truncate">
                      <span className="font-medium">{v.description ?? v.varenr}</span>
                      {v.quantity > 0 && (
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          · {Math.round(v.quantity)} stk.
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-right">
                      {v.weightKg > 0 && (
                        <span className="font-medium">{fmtKg(v.weightKg, 1)}</span>
                      )}
                      <span className="text-muted-foreground text-xs">
                        {v.weightKg > 0 ? " · " : ""}
                        {fmtKr(v.revenue)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {!harKg && (
                <p className="text-[11px] text-muted-foreground">
                  Kilo pr. varelinje udfyldes ved næste fakturaimport — indtil da vises kun antal og kroner.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
