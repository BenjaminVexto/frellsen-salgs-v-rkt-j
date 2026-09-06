import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { PackageSearch, ChevronDown, ChevronRight } from "lucide-react";
import { getSortimentDaekning } from "@/lib/sortiment.functions";
import { getTeSortimentKunde, teTypeLabel } from "@/lib/te-sortiment.functions";

const FOLD_KEY = "sortiment-kort-foldet";

type Vare = { varenr: string; beskrivelse: string | null; kunder: number };

function Chip({
  label,
  pct,
  aktiv,
  varer,
  onClick,
}: {
  label: string;
  pct?: number | null;
  aktiv: boolean;
  varer?: Vare[];
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs transition-colors ${
        aktiv
          ? "border-foreground/40 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
      title={varer && varer.length > 0 ? "Se de mest købte varer" : undefined}
    >
      {label}
      {pct !== null && pct !== undefined && (
        <span className="text-muted-foreground/80">{Math.round(Number(pct))} %</span>
      )}
    </button>
  );
}

function VareBoks({ varer }: { varer: Vare[] }) {
  if (varer.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-border p-3 text-xs text-muted-foreground">
        Ingen varer at fremhæve.
      </div>
    );
  }
  return (
    <ul className="mt-2 space-y-1 rounded-md border border-border p-3">
      {varer.map((v) => (
        <li key={v.varenr} className="text-xs text-muted-foreground">
          <span className="font-mono">{v.varenr}</span> · {v.beskrivelse ?? "—"}{" "}
          <span className="text-muted-foreground/80">
            ({v.kunder} {v.kunder === 1 ? "butik køber" : "butikker køber"} varen)
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SortimentKort({
  companyId,
  afdelingNr,
}: {
  companyId: string;
  afdelingNr: number | null | undefined;
}) {
  const enabled = afdelingNr === 21;
  const hentDaekning = useServerFn(getSortimentDaekning);
  const hentTe = useServerFn(getTeSortimentKunde);

  const [foldet, setFoldet] = useState(false);
  useEffect(() => {
    try {
      setFoldet(window.localStorage.getItem(FOLD_KEY) === "1");
    } catch {
      /* ignoreres */
    }
  }, []);
  const [aaben, setAaben] = useState<string | null>(null);

  const daekning = useQuery({
    queryKey: ["sortiment-daekning", companyId],
    queryFn: () => hentDaekning({ data: { companyId } }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  const te = useQuery({
    queryKey: ["te-sortiment", companyId],
    queryFn: () => hentTe({ data: { companyId } }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (!enabled) return null;

  const laeser = daekning.isLoading || te.isLoading;
  const d = daekning.data;
  const t = te.data;

  if (laeser) {
    return (
      <Card className="p-5">
        <h2 className="font-semibold flex items-center gap-2">
          <PackageSearch className="h-4 w-4" /> Sortiment
        </h2>
        <p className="text-sm text-muted-foreground mt-2">Beregner …</p>
      </Card>
    );
  }
  if (!d?.vises) return null;

  const foerer = d.foerer ?? [];
  const mangler = d.mangler ?? [];
  const relevante = d.relevante_i_alt ?? 0;
  const foererRelevante = d.foerer_relevante ?? 0;

  const teLinjer = t?.vises ? (t.linjer ?? []) : [];
  const teVises = teLinjer.length > 0;
  const teFoerer = teLinjer.filter((l) => l.foerer).length;
  const ukendt = t?.ukendt_linjer ?? 0;

  const toggleFold = () => {
    const ny = !foldet;
    setFoldet(ny);
    try {
      window.localStorage.setItem(FOLD_KEY, ny ? "1" : "0");
    } catch {
      /* ignoreres */
    }
  };

  const aabenGruppe = aaben?.startsWith("g:") ? aaben.slice(2) : null;
  const aabenTe = aaben?.startsWith("t:") ? aaben.slice(2) : null;

  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={toggleFold}
        className="flex w-full items-center gap-2 text-left"
      >
        {foldet ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <PackageSearch className="h-4 w-4" />
        <span className="font-semibold">
          {foererRelevante} af {relevante} varegrupper
          {teVises && (
            <span className="text-muted-foreground font-normal">
              {" "}· Te: {teFoerer} af {teLinjer.length} typer
            </span>
          )}
        </span>
      </button>

      {!foldet && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex flex-wrap gap-1.5">
              {foerer.map((g) => (
                <Chip key={`f-${g.gruppe}`} label={g.navn} aktiv={false} />
              ))}
              {mangler.map((g) => (
                <Chip
                  key={`m-${g.gruppe}`}
                  label={g.navn}
                  pct={g.pct}
                  aktiv={aabenGruppe === g.gruppe}
                  varer={g.varer}
                  onClick={() =>
                    setAaben(aabenGruppe === g.gruppe ? null : `g:${g.gruppe}`)
                  }
                />
              ))}
            </div>
            {aabenGruppe && (
              <VareBoks
                varer={mangler.find((g) => g.gruppe === aabenGruppe)?.varer ?? []}
              />
            )}
          </div>

          {teVises && (
            <div>
              <div className="flex flex-wrap gap-1.5">
                {teLinjer.map((l) =>
                  l.foerer ? (
                    <Chip key={`tf-${l.te_type}`} label={teTypeLabel(l.te_type)} aktiv={false} />
                  ) : (
                    <Chip
                      key={`tm-${l.te_type}`}
                      label={teTypeLabel(l.te_type)}
                      pct={l.pct}
                      aktiv={aabenTe === l.te_type}
                      varer={l.varer}
                      onClick={() =>
                        setAaben(aabenTe === l.te_type ? null : `t:${l.te_type}`)
                      }
                    />
                  ),
                )}
              </div>
              {aabenTe && (
                <VareBoks
                  varer={teLinjer.find((l) => l.te_type === aabenTe)?.varer ?? []}
                />
              )}
            </div>
          )}

          {ukendt > 0 && (
            <p className="text-xs text-muted-foreground/80">
              {ukendt} {ukendt === 1 ? "varelinje mangler" : "varelinjer mangler"} tetype —{" "}
              <Link to="/admin/tilbudskatalog" className="underline hover:text-muted-foreground">
                sæt tetype i Tilbudskataloget
              </Link>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
