import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { useAfdeling } from "@/contexts/afdeling-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AfdelingBadge } from "@/components/afdeling-badge";
import {
  getDubletKandidater,
  setAfloestAf,
  setDubletAfvist,
  type DubletPar,
  type DubletPost,
} from "@/lib/dubletter.functions";
import { ArrowLeft, Loader2, Copy, Undo2, ArrowRight, Ban } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/dubletter")({
  component: DubletterSide,
  head: () => ({
    meta: [
      { title: "Dubletter · Afløste debitorposter | Frellsen CRM" },
      {
        name: "description",
        content:
          "Find gamle Visma-debitorposter der er afløst af en nyere post med samme CVR og næsten samme navn.",
      },
      { property: "og:title", content: "Dubletter · Afløste debitorposter" },
      {
        property: "og:description",
        content:
          "Find gamle Visma-debitorposter der er afløst af en nyere post med samme CVR og næsten samme navn.",
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
  v ? new Date(v.slice(0, 10) + "T00:00:00Z").toLocaleDateString("da-DK") : "—";

function PostKolonne({
  post,
  titel,
  tone,
}: {
  post: DubletPost;
  titel: string;
  tone: "doed" | "aktiv";
}) {
  return (
    <div className="min-w-0 flex-1 rounded-md border p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={
            tone === "doed"
              ? "bg-muted/60 font-normal"
              : "bg-primary/10 border-primary/30 font-normal"
          }
        >
          {titel}
        </Badge>
        <AfdelingBadge afdelingNr={post.afdeling_nr} />
      </div>
      <Link
        to="/virksomheder/$id"
        params={{ id: post.id }}
        className="block font-medium hover:underline mt-2 truncate"
      >
        {post.name}
      </Link>
      {post.visma_enhed && (
        <div className="mt-1 text-xs font-medium text-foreground truncate">
          Enhed: {post.visma_enhed}
        </div>
      )}
      <dl className="mt-2 text-xs text-muted-foreground space-y-0.5">
        <div className="truncate">
          {post.address ?? "—"}
          {post.zip ? ` · ${post.zip}` : ""}
        </div>
        <div>Visma-nr. {post.visma_id ?? "—"}</div>
        <div>Oprettet i Visma {fmtDato(post.created_in_visma)}</div>
        <div>Sidste varekøb {fmtDato(post.sidste_varekoeb)}</div>
        <div>Omsætning 12 mdr. {fmtKr(post.omsaetning_12m)}</div>
      </dl>
    </div>
  );
}

function ParKort({
  par,
  busy,
  onAfloes,
  onAfvis,
}: {
  par: DubletPar;
  busy: boolean;
  onAfloes: (afloestAf: string | null) => void;
  onAfvis: (afvist: boolean) => void;
}) {
  const begrundelser: string[] = [];
  if (par.identisk_navn) begrundelser.push("identisk navn");
  else begrundelser.push(`navnelighed ${Math.round(par.lighed * 100)} %`);
  if (par.samme_postnr) begrundelser.push("samme postnummer");

  if (par.kategori === "leveringssted") {
    begrundelser.push("forskellig adresse");
  } else if (par.kategori === "separat_enhed") {
    begrundelser.push(
      `samme adresse, men forskellig enhed: ${par.doed.visma_enhed} vs. ${par.aktiv.visma_enhed}`,
    );
  } else {
    begrundelser.push(
      par.doed.visma_enhed || par.aktiv.visma_enhed
        ? `samme adresse og samme enhed${par.doed.visma_enhed ? `: ${par.doed.visma_enhed}` : ""}`
        : "samme adresse, ingen enhed angivet",
    );
  }

  const markeret = !!par.afloest_af_company_id;
  const afvist = !!par.afvist_at;
  const dubletPrimaer = par.kategori === "dublet";

  return (
    <Card className="p-4">
      <div className="flex flex-col md:flex-row items-stretch gap-3">
        <PostKolonne post={par.doed} titel="Død post" tone="doed" />
        <div className="flex items-center justify-center text-muted-foreground">
          <ArrowRight className="h-5 w-5" />
        </div>
        <PostKolonne post={par.aktiv} titel="Aktiv post" tone="aktiv" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          CVR {par.cvr} · {begrundelser.join(", ")}
          {markeret && (
            <>
              {" · "}
              <span className="text-foreground">markeret som afløst</span>
            </>
          )}
          {afvist && (
            <>
              {" · "}
              <span className="text-foreground">
                {dubletPrimaer ? "afvist som dublet" : "markeret som selvstændigt"}
              </span>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {dubletPrimaer ? (
            markeret ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onAfloes(null)}>
                <Undo2 className="h-4 w-4 mr-1.5" /> Fortryd afløsning
              </Button>
            ) : (
              <Button size="sm" disabled={busy || afvist} onClick={() => onAfloes(par.aktiv.id)}>
                Markér som afløst
              </Button>
            )
          ) : afvist ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAfvis(false)}>
              <Undo2 className="h-4 w-4 mr-1.5" /> Fortryd
            </Button>
          ) : (
            <Button size="sm" disabled={busy || markeret} onClick={() => onAfvis(true)}>
              Selvstændigt leveringssted
            </Button>
          )}

          {!dubletPrimaer && !afvist && !markeret && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onAfloes(par.aktiv.id)}
            >
              Markér som afløst
            </Button>
          )}

          {dubletPrimaer &&
            (afvist ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onAfvis(false)}>
                <Undo2 className="h-4 w-4 mr-1.5" /> Fortryd afvisning
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || markeret}
                onClick={() => onAfvis(true)}
              >
                <Ban className="h-4 w-4 mr-1.5" /> Ikke en dublet
              </Button>
            ))}
          {!dubletPrimaer && !afvist && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || markeret}
              onClick={() => onAfvis(true)}
            >
              <Ban className="h-4 w-4 mr-1.5" /> Ikke en dublet
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function DubletterSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { afdelinger, labelFor } = useAfdeling();
  const [q, setQ] = useState("");
  const [afd, setAfd] = useState<string>("alle");
  const [skjulOffentlige, setSkjulOffentlige] = useState(false);
  const [visAfviste, setVisAfviste] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  const hentKandidater = useServerFn(getDubletKandidater);
  const gemAfloest = useServerFn(setAfloestAf);
  const gemAfvist = useServerFn(setDubletAfvist);

  const kandQ = useQuery({
    enabled: auth.role === "admin",
    queryKey: ["dublet-kandidater"],
    queryFn: () => hentKandidater({ data: undefined as any }),
  });

  const alle: DubletPar[] = kandQ.data?.par ?? [];

  const antalAfvist = alle.filter((p) => p.afvist_at).length;
  const antalMarkeret = alle.filter((p) => p.afloest_af_company_id).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return alle.filter((p) => {
      if (!visAfviste && p.afvist_at) return false;
      if (skjulOffentlige && p.er_offentlig) return false;
      if (afd !== "alle" && String(p.doed.afdeling_nr ?? "") !== afd) return false;
      if (!needle) return true;
      return (
        p.doed.name.toLowerCase().includes(needle) ||
        p.aktiv.name.toLowerCase().includes(needle) ||
        p.cvr.includes(needle) ||
        (p.doed.visma_id ?? "").toLowerCase().includes(needle) ||
        (p.aktiv.visma_id ?? "").toLowerCase().includes(needle)
      );
    });
  }, [alle, q, afd, skjulOffentlige, visAfviste]);

  const sikre = filtered.filter((p) => p.identisk_navn);
  const sandsynlige = filtered
    .filter((p) => !p.identisk_navn)
    .sort((a, b) => b.lighed - a.lighed);

  async function afloes(par: DubletPar, afloestAf: string | null) {
    setBusyId(par.doed.id);
    try {
      await gemAfloest({
        data: { company_id: par.doed.id, afloest_af_company_id: afloestAf },
      });
      toast.success(afloestAf ? "Markeret som afløst" : "Markering fjernet");
      await kandQ.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Kunne ikke gemme");
    } finally {
      setBusyId(null);
    }
  }

  async function afvis(par: DubletPar, afvist: boolean) {
    setBusyId(par.doed.id);
    try {
      await gemAfvist({ data: { company_id: par.doed.id, afvist } });
      toast.success(afvist ? "Markeret som ikke en dublet" : "Afvisning fortrudt");
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
        Par hvor en død debitorpost (intet salg, intet aktivt udstyr) har næsten samme
        navn som en aktiv post under samme CVR. Markér den gamle post som afløst af den
        nye — intet slettes eller flettes, og Visma-data røres ikke.
      </p>

      <div className="flex flex-wrap items-center gap-4 mt-4">
        <Input
          placeholder="Søg navn, CVR eller Visma-nr."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={afd} onValueChange={setAfd}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Afdeling" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle afdelinger</SelectItem>
            {afdelinger.map((a) => (
              <SelectItem key={a.afdeling_nr} value={String(a.afdeling_nr)}>
                {labelFor(a.afdeling_nr)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="skjul-offentlige"
            checked={skjulOffentlige}
            onCheckedChange={setSkjulOffentlige}
          />
          <Label htmlFor="skjul-offentlige" className="text-sm font-normal">
            Skjul offentlige kunder
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="vis-afviste" checked={visAfviste} onCheckedChange={setVisAfviste} />
          <Label htmlFor="vis-afviste" className="text-sm font-normal">
            Vis afviste
          </Label>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        {sikre.length} sikre · {sandsynlige.length} sandsynlige · {antalAfvist} afvist ·{" "}
        {antalMarkeret} markeret som afløst
      </p>

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

      {!kandQ.isLoading && (
        <div className="mt-5 space-y-8">
          <section>
            <h2 className="text-sm font-medium mb-3">
              Sikker — identisk navn ({sikre.length})
            </h2>
            <div className="space-y-3">
              {sikre.map((p) => (
                <ParKort
                  key={p.doed.id}
                  par={p}
                  busy={busyId === p.doed.id}
                  onAfloes={(v) => afloes(p, v)}
                  onAfvis={(v) => afvis(p, v)}
                />
              ))}
              {!sikre.length && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  Ingen par med identisk navn.
                </Card>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium mb-3">
              Sandsynlig ({sandsynlige.length})
            </h2>
            <div className="space-y-3">
              {sandsynlige.map((p) => (
                <ParKort
                  key={p.doed.id}
                  par={p}
                  busy={busyId === p.doed.id}
                  onAfloes={(v) => afloes(p, v)}
                  onAfvis={(v) => afvis(p, v)}
                />
              ))}
              {!sandsynlige.length && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  Ingen sandsynlige par.
                </Card>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
