import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, Network } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cvrKoncern, type KoncernSelskab } from "@/lib/cvr-adresse.functions";

function Linje({ s, label }: { s: KoncernSelskab; label?: string }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <div className="min-w-0">
        {label && <span className="text-xs text-muted-foreground mr-1">{label}</span>}
        {s.crm[0] ? (
          <Link to="/virksomheder/$id" params={{ id: s.crm[0].id }} className="font-medium hover:underline">
            {s.name}
          </Link>
        ) : (
          <span className="font-medium">{s.name}</span>
        )}
        <span className="text-xs text-muted-foreground ml-1">
          CVR {s.cvr}{s.city ? ` · ${s.city}` : ""}
        </span>
      </div>
      {s.crm.length ? (
        <Badge variant="outline" className="border-success/40 text-success shrink-0">Kunde hos os</Badge>
      ) : (
        <Badge variant="outline" className="shrink-0">Ikke kunde endnu</Badge>
      )}
    </li>
  );
}

export function KoncernSektion({ cvr, children }: { cvr: string | null | undefined; children?: React.ReactNode }) {
  const [aaben, setAaben] = useState(false);
  const fn = useServerFn(cvrKoncern);
  const ok = !!cvr && /^\d{8}$/.test(cvr);
  const q = useQuery({
    queryKey: ["cvr-koncern", cvr],
    queryFn: () => fn({ data: { cvr: cvr! } }),
    enabled: ok,
    staleTime: 60 * 60 * 1000,
  });
  if (!ok) return children ? <>{children}</> : null;
  const resume = q.isLoading
    ? "Koncern: henter …"
    : q.data?.moder
      ? `Koncern: ${q.data.moder.name ?? q.data.moder.cvr} + ${q.data.soestre.length} søsterselskab${q.data.soestre.length === 1 ? "" : "er"}`
      : "Koncern: intet moderselskab registreret";
  return (
    <Card className="p-4 space-y-2">
      <button
        type="button"
        onClick={() => setAaben((v) => !v)}
        aria-expanded={aaben}
        className="w-full text-left font-medium text-sm flex items-center gap-2"
      >
        <Network className="h-4 w-4" /> {resume} <span className="text-muted-foreground">{aaben ? "▾" : "▸"}</span>
      </button>
      {aaben && (<>
      <p className="text-xs text-muted-foreground">Fra CVR's ejerregister</p>
      {q.isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter koncerndata …
        </div>
      )}
      {q.isError && (
        <div className="text-sm text-destructive flex items-center gap-2">
          Kunne ikke hente koncerndata.
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>Prøv igen</Button>
        </div>
      )}
      {q.data && !q.data.moder && (
        <p className="text-sm text-muted-foreground">Intet moderselskab med over 50 % ejerandel registreret.</p>
      )}
      {q.data?.moder && (
        <>
          <ul className="divide-y">
            <Linje s={q.data.moder} label="Moderselskab:" />
          </ul>
          <div className="text-xs font-medium text-muted-foreground pt-1">
            Søsterselskaber ({q.data.soestre.length})
          </div>
          {q.data.soestre.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen andre aktive datterselskaber.</p>
          ) : (
            <ul className="divide-y">
              {q.data.soestre.map((s) => <Linje key={s.cvr} s={s} />)}
            </ul>
          )}
        </>
      )}
      {children}
      </>)}
    </Card>
  );
}
