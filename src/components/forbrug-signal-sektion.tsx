import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getForbrugSignalForCompany,
  type ForbrugSignalGruppe,
  type ForbrugSignalLokation,
} from "@/lib/forbrug-signal.functions";
import { aarsagLabel, erFaldKlasse, klasseLabel } from "@/lib/forbrug-labels";
import { gruppeKodeOf, KAFFE_KODE } from "@/lib/sales-utils";
import type { Location } from "@/components/lokationer-sektion";

const DOT: Record<string, string> = {
  stoppet: "bg-destructive",
  kritisk: "bg-destructive",
  markant_fald: "bg-amber-500",
  let_fald: "bg-amber-500",
  normal: "bg-emerald-500",
  vaekst: "bg-emerald-500",
  afventer_rytme: "bg-muted-foreground",
  ny: "bg-muted-foreground",
};

const dotClass = (klasse?: string | null) =>
  (klasse && DOT[klasse]) || "bg-muted-foreground";

const kgTal = (v: number | null) =>
  v == null ? "–" : v.toLocaleString("da-DK", { maximumFractionDigits: 1 });

const pct = (v: number | null) =>
  v == null ? "–" : `${v > 0 ? "+" : ""}${v.toLocaleString("da-DK", { maximumFractionDigits: 1 })} %`;

const dato = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("da-DK", { month: "short", year: "numeric" }) : "ukendt";

const kr = (v: number | null) =>
  v == null ? null : `${Math.round(v).toLocaleString("da-DK")} kr/mdr`;

function GruppeLinje({
  row,
  label,
}: {
  row: ForbrugSignalGruppe;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const fald = erFaldKlasse(row.klasse);
  const erNy = row.klasse === "ny";
  const navn = label ?? row.gruppe_navn ?? row.product_group_1 ?? "Ukendt gruppe";
  const foer = row.base_kg_pr_mdr ?? 0;
  const nu = row.akt_kg_pr_mdr ?? 0;
  const skala = Math.max(foer, nu, 0.0001);

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotClass(row.klasse)}`} />
        <span className="font-medium text-sm">{navn}</span>
        <span className="text-muted-foreground text-sm">· {klasseLabel(row.klasse)}</span>
        {row.er_primaer && (
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">primær</span>
        )}
      </div>

      {erNy ? (
        <p className="text-sm text-muted-foreground mt-0.5 ml-[18px]">
          Ny kunde, for kort historik til sammenligning.
        </p>
      ) : (
        <div className="mt-1 ml-[18px] flex items-center gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/25"
                style={{ width: `${Math.min(100, (foer / skala) * 100)}%` }}
                title={`Før: ${kgTal(foer)} kg/mdr`}
              />
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (nu / skala) * 100)}%` }}
                title={`Nu: ${kgTal(nu)} kg/mdr`}
              />
            </div>
          </div>
          <div className="shrink-0 text-right text-xs tabular-nums leading-tight">
            <div className="text-muted-foreground">{kgTal(foer)} kg/mdr før</div>
            <div className="font-medium">
              {kgTal(nu)} kg/mdr nu{" "}
              <span className="text-muted-foreground font-normal">({pct(row.afvigelse_pct)})</span>
            </div>
          </div>
        </div>
      )}

      {fald && (
        <>
          <p className="text-sm mt-1 ml-[18px]">
            {aarsagLabel(row.aarsag) ?? "Uklart mønster"}
            {kr(row.tabt_kr_pr_mdr) ? (
              <span className="text-muted-foreground"> · {kr(row.tabt_kr_pr_mdr)}</span>
            ) : null}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1 ml-[14px] mt-0.5 text-xs text-muted-foreground"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
            Nedbrydning
          </Button>
          {open && (
            <div className="ml-[18px] mt-1 text-xs text-muted-foreground space-y-0.5">
              <p>
                Ordrer: {pct(row.ordre_aendring_pct)} · Mængde pr. ordre: {pct(row.stk_aendring_pct)}
              </p>
              <p>
                Sidste køb: {dato(row.sidste_koeb)}
                {row.forventet_interval_mdr != null
                  ? ` · normal rytme ca. hver ${row.forventet_interval_mdr.toLocaleString("da-DK", { maximumFractionDigits: 1 })} mdr.`
                  : ""}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ForbrugSignalSektion({
  companyId,
  locations,
}: {
  companyId: string;
  locations: Location[];
}) {
  const fetchSignal = useServerFn(getForbrugSignalForCompany);
  const { data, isLoading } = useQuery({
    queryKey: ["forbrug-signal-company", companyId],
    queryFn: () => fetchSignal({ data: { companyId } }),
  });
  const [lokOpen, setLokOpen] = useState(false);
  const [visAlle, setVisAlle] = useState(false);

  const grupper = data?.grupper ?? [];
  const lokationer = data?.lokationer ?? [];

  const lokNavn = (id: string | null) => {
    if (!id) return "Ukendt lokation";
    const l = locations.find((x) => x.id === id);
    if (!l) return "Ukendt lokation";
    return l.city || l.address || l.visma_delivery_no || "Ukendt lokation";
  };

  const distinkteLok = useMemo(
    () => new Set(lokationer.map((r) => r.location_id).filter(Boolean)).size,
    [lokationer],
  );

  // Kaffe altid øverst, derefter kg faldende.
  const sorteredeGrupper = useMemo(() => {
    const arr = [...grupper];
    arr.sort((a, b) => {
      const ka = gruppeKodeOf(a.product_group_1) === KAFFE_KODE ? 0 : 1;
      const kb = gruppeKodeOf(b.product_group_1) === KAFFE_KODE ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return (b.akt_kg_pr_mdr ?? 0) - (a.akt_kg_pr_mdr ?? 0);
    });
    return arr;
  }, [grupper]);

  const smaa = (g: ForbrugSignalGruppe) =>
    (g.akt_kg_pr_mdr ?? 0) < 1 && (g.base_kg_pr_mdr ?? 0) < 1;
  const synlige = visAlle ? sorteredeGrupper : sorteredeGrupper.filter((g) => !smaa(g));
  const skjulte = sorteredeGrupper.length - sorteredeGrupper.filter((g) => !smaa(g)).length;

  const sorteredeLok = useMemo(() => {
    const arr = [...lokationer];
    arr.sort((a: ForbrugSignalLokation, b: ForbrugSignalLokation) => {
      const fa = erFaldKlasse(a.klasse) ? 0 : 1;
      const fb = erFaldKlasse(b.klasse) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (b.tabt_kr_pr_mdr ?? 0) - (a.tabt_kr_pr_mdr ?? 0);
    });
    return arr;
  }, [lokationer]);

  const nogenIFald = grupper.some((g) => erFaldKlasse(g.klasse));

  return (
    <Card className="p-4">
      <h3 className="font-semibold">Forbrugsudvikling</h3>

      {isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : grupper.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">
          Ikke nok købshistorik til at beregne forbrugsudvikling. Der kræves mindst 4 aktive måneder
          inden for det seneste år.
        </p>
      ) : (
        <>
          {!nogenIFald && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-2">
              Forbruget følger det normale mønster.
            </p>
          )}
          <div className="mt-2 divide-y">
            {synlige.map((g, i) => (
              <GruppeLinje key={`${g.product_group_1}-${i}`} row={g} />
            ))}
          </div>
          {!visAlle && skjulte > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1 mt-1 text-xs text-muted-foreground"
              onClick={() => setVisAlle(true)}
            >
              Vis alle ({skjulte} små grupper)
            </Button>
          )}

          {distinkteLok > 1 && (
            <div className="mt-3 border-t pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1 text-xs text-muted-foreground"
                onClick={() => setLokOpen((v) => !v)}
              >
                {lokOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 mr-1" />
                )}
                Fordelt på lokationer ({distinkteLok})
              </Button>
              {lokOpen && (
                <div className="mt-1 divide-y">
                  {sorteredeLok.map((r, i) => (
                    <GruppeLinje
                      key={`${r.location_id}-${r.product_group_1}-${i}`}
                      row={r}
                      label={`${lokNavn(r.location_id)} · ${r.gruppe_navn ?? r.product_group_1 ?? "Ukendt gruppe"}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
