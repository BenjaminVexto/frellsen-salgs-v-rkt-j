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
import { fmtKg, fmtKr, type SalesMonthlyRow } from "@/lib/sales-utils";
import {
  HOVEDKATEGORIER,
  hovedkategori,
  hovedkategoriAf,
  type HovedkategoriKey,
} from "@/lib/underkategori";
import {
  getMonthlyConsumableProducts,
  getUnderkategoriSeries,
} from "@/lib/sales.functions";

const ALLE = "ALLE";
type Enhed = "kg" | "kr";

function maanedsAkse(months: number) {
  const out: { period: string; label: string }[] = [];
  const now = new Date();
  // Kun hele måneder — den igangværende måned indgår ikke.
  for (let i = months; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      period: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`,
      label: d.toLocaleDateString("da-DK", { month: "short" }),
    });
  }
  return out;
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + "T00:00:00Z");
  return d.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
}

export function ConsumableKgChart({
  rows,
  months = 12,
  locationIds,
}: {
  rows: SalesMonthlyRow[];
  months?: number;
  locationIds?: string[];
  gruppeNavne?: Record<string, string>;
}) {
  const akse = useMemo(() => maanedsAkse(months), [months]);
  const fra = akse[0]?.period ?? "";
  const til = akse[akse.length - 1]?.period ?? "";
  const iPerioden = useMemo(
    () => rows.filter((r) => r.period >= fra && r.period <= til),
    [rows, fra, til],
  );

  // Hovedkategorier hvor kunden har data i perioden.
  const tilgaengelige = useMemo(() => {
    const sum = new Map<HovedkategoriKey, number>();
    for (const r of iPerioden) {
      const k = hovedkategoriAf(r.product_group_1);
      const v = (Number(r.weight_kg) || 0) * 1000 + Math.abs(Number(r.revenue) || 0);
      if (v <= 0) continue;
      sum.set(k, (sum.get(k) ?? 0) + v);
    }
    return HOVEDKATEGORIER.filter((h) => (sum.get(h.key) ?? 0) > 0);
  }, [iPerioden]);

  const defaultKey: HovedkategoriKey =
    tilgaengelige.find((h) => h.key === "kaffe")?.key ?? tilgaengelige[0]?.key ?? "kaffe";
  const [valgtHoved, setValgtHoved] = useState<HovedkategoriKey | null>(null);
  const aktivHoved =
    valgtHoved && tilgaengelige.some((h) => h.key === valgtHoved) ? valgtHoved : defaultKey;
  const kat = hovedkategori(aktivHoved);
  const [under, setUnder] = useState<string>(ALLE);
  const [enhed, setEnhed] = useState<Enhed>("kg");

  const harLokationer = !!locationIds && locationIds.length > 0;
  const fetchUnder = useServerFn(getUnderkategoriSeries);
  const underQ = useQuery({
    queryKey: ["underkategori-serier", locationIds?.slice().sort().join(","), fra, til],
    queryFn: () => fetchUnder({ data: { locationIds: locationIds ?? [], fra, til } }),
    enabled: harLokationer && !!fra,
  });
  const underRows = useMemo(() => underQ.data ?? [], [underQ.data]);

  // Underkategorier kunden har data i, for den valgte hovedkategori.
  const underValg = useMemo(() => {
    if (aktivHoved === "oevrigt") return [];
    const m = new Map<string, { label: string; sort: number; v: number }>();
    for (const r of underRows) {
      if (r.hovedkategori !== aktivHoved) continue;
      const v = (Number(r.kg) || 0) * 1000 + Math.abs(Number(r.kr) || 0);
      const cur = m.get(r.label) ?? { label: r.label, sort: r.sort, v: 0 };
      cur.v += v;
      m.set(r.label, cur);
    }
    return Array.from(m.values())
      .filter((x) => x.v > 0)
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "da-DK"));
  }, [underRows, aktivHoved]);

  const aktivUnder = under !== ALLE && underValg.some((u) => u.label === under) ? under : ALLE;

  const kgDeaktiveret = !kat.kgMuligt;
  const effektivEnhed: Enhed = kgDeaktiveret ? "kr" : enhed;
  const fmtVal = (n: number) => (effektivEnhed === "kg" ? fmtKg(n, 1) : fmtKr(n));

  const serie = (e: Enhed) => {
    const idx = new Map(akse.map((a, i) => [a.period, i]));
    const out = akse.map((a) => ({ ...a, value: 0 }));
    if (aktivUnder === ALLE) {
      for (const r of iPerioden) {
        if (hovedkategoriAf(r.product_group_1) !== aktivHoved) continue;
        const i = idx.get(r.period);
        if (i != null)
          out[i].value += (e === "kg" ? Number(r.weight_kg) : Number(r.revenue)) || 0;
      }
    } else {
      for (const r of underRows) {
        if (r.hovedkategori !== aktivHoved || r.label !== aktivUnder) continue;
        const i = idx.get(r.period);
        if (i != null) out[i].value += (e === "kg" ? Number(r.kg) : Number(r.kr)) || 0;
      }
    }
    return out;
  };

  const kgSerie = useMemo(
    () => serie("kg"),
    [akse, iPerioden, underRows, aktivHoved, aktivUnder],
  );
  const harKgIPerioden = kgSerie.some((d) => d.value > 0);
  const data = useMemo(
    () => (effektivEnhed === "kg" ? kgSerie : serie("kr")),
    [effektivEnhed, kgSerie, akse, iPerioden, underRows, aktivHoved, aktivUnder],
  );
  const tomKg = effektivEnhed === "kg" && !harKgIPerioden;
  const visData = tomKg ? [] : data;
  const max = Math.max(1, ...visData.map((d) => d.value));
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);
  const clickable = harLokationer && !tomKg;

  const fetchFn = useServerFn(getMonthlyConsumableProducts);
  const varerQ = useQuery({
    queryKey: [
      "monthly-consumable-products",
      openPeriod,
      aktivHoved,
      aktivUnder,
      effektivEnhed,
      locationIds?.slice().sort().join(","),
    ],
    queryFn: () =>
      fetchFn({
        data: {
          locationIds: locationIds ?? [],
          period: openPeriod!,
          gruppeKoder: kat.koder,
          underkategori: aktivUnder === ALLE ? null : aktivUnder,
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

  const visningsNavn = aktivUnder === ALLE ? kat.label : aktivUnder;
  const titel = `${effektivEnhed === "kg" ? "Kg" : "Kr."} ${visningsNavn.toLowerCase()} pr. måned`;

  const vaelgHoved = (key: HovedkategoriKey) => {
    setValgtHoved(key);
    setUnder(ALLE);
    if (!hovedkategori(key).kgMuligt) setEnhed("kr");
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
              {tilgaengelige.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => vaelgHoved(h.key)}
                  className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${
                    h.key === aktivHoved
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["kg", "kr"] as Enhed[]).map((e) => {
                const disabled = e === "kg" && kgDeaktiveret;
                return (
                  <button
                    key={e}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && setEnhed(e)}
                    title={disabled ? "Maskiner og teknik vejes ikke" : undefined}
                    className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${
                      disabled
                        ? "border-border text-muted-foreground/50 cursor-not-allowed"
                        : e === effektivEnhed
                          ? "bg-secondary text-secondary-foreground border-secondary"
                          : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {underValg.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {[{ label: ALLE, visning: "Alle" }, ...underValg.map((u) => ({ label: u.label, visning: u.label }))].map(
              (u) => (
                <button
                  key={u.label}
                  type="button"
                  onClick={() => setUnder(u.label)}
                  className={`text-[11px] rounded-full border px-2 py-0.5 transition-colors ${
                    u.label === aktivUnder
                      ? "bg-muted text-foreground border-foreground/30"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {u.visning}
                </button>
              ),
            )}
          </div>
        )}
        {kgDeaktiveret && (
          <p className="text-[11px] text-muted-foreground mt-2">Maskiner og teknik vejes ikke.</p>
        )}
        {tomKg ? (
          <div className="h-36 mt-3 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
            Ingen kg registreret i denne gruppe — skift til kr
          </div>
        ) : (
          <div className="flex gap-1.5 h-36 mt-3 w-full overflow-hidden">
            {visData.map((d) => (
              <div
                key={d.period}
                className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full"
              >
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
                <span className="w-full text-center text-[10px] text-muted-foreground truncate">
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Den igangværende måned indgår ikke.
        </p>
      </Card>

      <Dialog open={!!openPeriod} onOpenChange={(o) => !o && setOpenPeriod(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {visningsNavn} · {openPeriod ? formatPeriodLabel(openPeriod) : ""}
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
              {grafSum > 0
                ? daekningsTekst
                : `Ingen køb i ${visningsNavn.toLowerCase()} i ${openPeriod ? formatPeriodLabel(openPeriod) : "denne måned"}.`}
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
              {afviger && (
                <p className="text-[11px] text-muted-foreground">{daekningsTekst}</p>
              )}
              {!harKg && effektivEnhed === "kr" && (
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
