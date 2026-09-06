import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AfdelingBadge } from "@/components/afdeling-badge";
import {
  getDubletKandidater,
  setAfloestAf,
  type DubletKandidat,
} from "@/lib/dubletter.functions";
import { ArrowLeft, Loader2, Copy, Undo2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/dubletter")({
  component: DubletterSide,
  head: () => ({
    meta: [
      { title: "Dubletter · Afløste debitorposter | Frellsen CRM" },
      {
        name: "description",
        content:
          "Markér gamle Visma-debitorposter som afløst af en nyere post, uden at slette eller flette data.",
      },
      { property: "og:title", content: "Dubletter · Afløste debitorposter" },
      {
        property: "og:description",
        content:
          "Markér gamle Visma-debitorposter som afløst af en nyere post, uden at slette eller flette data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmtKr = (v: number | null) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("da-DK", {
        style: "currency",
        currency: "DKK",
        maximumFractionDigits: 0,
      }).format(v);

const fmtDato = (v: string | null) =>
  v ? new Date(v + "T00:00:00Z").toLocaleDateString("da-DK") : "—";

function DubletterSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  const hentKandidater = useServerFn(getDubletKandidater);
  const gem = useServerFn(setAfloestAf);

  const kandQ = useQuery({
    enabled: auth.role === "admin",
    queryKey: ["dublet-kandidater"],
    queryFn: () => hentKandidater({ data: undefined as any }),
  });

  const kandidater: DubletKandidat[] = kandQ.data?.kandidater ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return kandidater;
    return kandidater.filter(
      (k) =>
        k.name.toLowerCase().includes(needle) ||
        k.cvr.includes(needle) ||
        (k.visma_id ?? "").toLowerCase().includes(needle),
    );
  }, [kandidater, q]);

  const antalMarkeret = kandidater.filter((k) => k.afloest_af_company_id).length;

  async function markér(companyId: string, afloestAf: string | null) {
    setBusyId(companyId);
    try {
      await gem({
        data: { company_id: companyId, afloest_af_company_id: afloestAf },
      });
      toast.success(afloestAf ? "Markeret som afløst" : "Markering fjernet");
      await kandQ.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke gemme");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <Link
          to="/admin/import"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Admin
        </Link>
      </div>

      <h1 className="text-xl font-semibold flex items-center gap-2">
        <Copy className="h-5 w-5" /> Dubletter
      </h1>
      <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
        Virksomheder der deler CVR med en anden virksomhed, og som selv hverken har
        salg eller aktivt udstyr. Markér den gamle post som afløst af den nye — intet
        slettes eller flettes, og Visma-data røres ikke.
      </p>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <Input
          placeholder="Søg navn, CVR eller Visma-nr."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-xs text-muted-foreground">
          {filtered.length} kandidater · {antalMarkeret} markeret som afløst
        </span>
      </div>

      {kandQ.isLoading && (
        <Card className="mt-4 p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter kandidater…
        </Card>
      )}
      {kandQ.error && (
        <Card className="mt-4 p-5 text-sm text-destructive">
          Kunne ikke hente kandidater.
        </Card>
      )}

      <div className="mt-4 space-y-3">
        {filtered.map((k) => (
          <Card key={k.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to="/virksomheder/$id"
                    params={{ id: k.id }}
                    className="font-medium hover:underline"
                  >
                    {k.name}
                  </Link>
                  <AfdelingBadge afdelingNr={k.afdeling_nr} />
                  {k.afloest_af_company_id && (
                    <Badge variant="outline" className="bg-muted/50 font-normal">
                      Afløst af {k.afloest_af_navn ?? "—"}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Visma-nr. {k.visma_id ?? "—"} · CVR {k.cvr} · oprettet i Visma{" "}
                  {fmtDato(k.created_in_visma)}
                </div>
              </div>
              {k.afloest_af_company_id && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === k.id}
                  onClick={() => markér(k.id, null)}
                >
                  <Undo2 className="h-4 w-4 mr-1.5" /> Fortryd
                </Button>
              )}
            </div>

            <div className="mt-3 border-t pt-3 space-y-2">
              <p className="text-xs uppercase text-muted-foreground">
                Andre virksomheder med samme CVR
              </p>
              {k.soeskende.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      to="/virksomheder/$id"
                      params={{ id: s.id }}
                      className="hover:underline"
                    >
                      {s.name}
                    </Link>
                    <span className="text-xs text-muted-foreground ml-2">
                      Visma-nr. {s.visma_id ?? "—"} · sidste varekøb{" "}
                      {fmtDato(s.sidste_varekoeb)} · omsætning 12 mdr.{" "}
                      {fmtKr(s.omsaetning_12m)}
                    </span>
                    <span className="ml-2 inline-flex align-middle">
                      <AfdelingBadge afdelingNr={s.afdeling_nr} />
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={
                      k.afloest_af_company_id === s.id ? "secondary" : "outline"
                    }
                    disabled={busyId === k.id || k.afloest_af_company_id === s.id}
                    onClick={() => markér(k.id, s.id)}
                  >
                    Markér som afløst af denne
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {!kandQ.isLoading && !filtered.length && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Ingen kandidater fundet.
          </Card>
        )}
      </div>
    </div>
  );
}
