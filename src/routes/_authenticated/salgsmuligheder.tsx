import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAfdeling } from "@/contexts/afdeling-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, TrendingUp, CalendarDays, Target, Trash2, FileText } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { tilbudAabningLinje, type ModtagerSporing } from "@/lib/tilbud-aabning";
import { PDFViewerDialog } from "@/components/pdf-viewer-dialog";
import { hentTilbudPdf } from "@/lib/tilbud-pdf.functions";

export const Route = createFileRoute("/_authenticated/salgsmuligheder")({
  component: PipelinePage,
  head: () => ({
    meta: [
      { title: "Salgsmuligheder – Frellsen Kaffe" },
      { name: "description", content: "Pipeline over bookede møder og sendte tilbud." },
      { property: "og:title", content: "Salgsmuligheder – Frellsen Kaffe" },
      { property: "og:description", content: "Pipeline over bookede møder og sendte tilbud." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Status = "moede_booket" | "tilbud_sendt" | "vundet" | "tabt";
type MoedeUdfald = "afholdt" | "aflyst" | "no_show" | "flyttet";
type TabtAarsag = "pris" | "konkurrent" | "ikke_relevant" | "timing" | "andet";

const COLUMNS: { key: Status; label: string }[] = [
  { key: "moede_booket", label: "Møde booket" },
  { key: "tilbud_sendt", label: "Tilbud sendt" },
];

const STATUS_LABEL: Record<Status, string> = {
  moede_booket: "Møde booket",
  tilbud_sendt: "Tilbud sendt",
  vundet: "Vundet",
  tabt: "Tabt",
};

const MOEDE_UDFALD_LABEL: Record<MoedeUdfald, string> = {
  afholdt: "Afholdt",
  aflyst: "Aflyst",
  no_show: "No-show",
  flyttet: "Flyttet",
};

const TABT_AARSAG_LABEL: Record<TabtAarsag, string> = {
  pris: "Pris",
  konkurrent: "Konkurrent",
  ikke_relevant: "Ikke relevant",
  timing: "Timing",
  andet: "Andet",
};

interface Opportunity {
  id: string;
  name: string;
  company_id: string;
  opportunity_type: string | null;
  estimated_value: number | null;
  status_v2: Status;
  moede_at: string | null;
  moede_udfald: MoedeUdfald | null;
  quote_id: string | null;
  tabt_aarsag: TabtAarsag | null;
  kilde: string | null;
  next_action: string | null;
  next_followup_date: string | null;
  assigned_to: string | null;
  /** Åbningsporing fra quote_recipients (kun tilbud_sendt med quote_id). */
  modtagere?: ModtagerSporing[];
  /** Det koblede tilbud (når quote_id er sat). */
  tilbud?: {
    id: string;
    quote_number: string | null;
    sent_date: string | null;
    status: string;
    pdf_path: string | null;
  } | null;
  companies?: { name: string } | null;
  profiles?: { full_name: string } | null;
}

const TILBUD_STATUS_LABEL: Record<string, string> = {
  kladde: "Kladde",
  sendt: "Sendt",
  under_opfølgning: "Under opfølgning",
  accepteret: "Accepteret",
  afvist: "Afvist",
  udløbet: "Udløbet",
};

const dkk = (n: number | null | undefined) =>
  new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const fmtDato = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("da-DK", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

/** Én rød tekstlinje på kortet: manglende mødeudfald eller overskredet opfølgning. */
function advarselTekst(o: Opportunity): string | null {
  const nu = Date.now();
  if (o.status_v2 === "moede_booket" && o.moede_at && !o.moede_udfald && new Date(o.moede_at).getTime() < nu) {
    return "Udfald mangler";
  }
  if ((o.status_v2 === "moede_booket" || o.status_v2 === "tilbud_sendt") && o.next_followup_date) {
    const dage = Math.floor((nu - new Date(o.next_followup_date + "T23:59:59").getTime()) / 86400000) + 1;
    if (dage > 0) return `Opfølgning overskredet ${dage} ${dage === 1 ? "dag" : "dage"}`;
  }
  return null;
}

/** Rød markering: mødetid passeret uden udfald, eller overskredet opfølgningsdato. */
function erOverskredet(o: Opportunity): boolean {
  const nu = Date.now();
  if (o.status_v2 === "moede_booket" && o.moede_at && !o.moede_udfald) {
    if (new Date(o.moede_at).getTime() < nu) return true;
  }
  if (
    (o.status_v2 === "moede_booket" || o.status_v2 === "tilbud_sendt") &&
    o.next_followup_date &&
    new Date(o.next_followup_date).getTime() < nu
  ) {
    return true;
  }
  return false;
}

function PipelinePage() {
  const { user, role, loading: authLoading } = useAuth();
  const { afdelingFilter } = useAfdeling();
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [saelgerFilter, setSaelgerFilter] = useState("__alle");
  const [kildeFilter, setKildeFilter] = useState("__alle");
  const isAdmin = role === "admin";

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("sales_opportunities")
      .select(
        "id,name,company_id,opportunity_type,estimated_value,status_v2,moede_at,moede_udfald,quote_id,tabt_aarsag,kilde,next_action,next_followup_date,assigned_to,companies!inner(name,afdeling_nr)",
      )
      .order("updated_at", { ascending: false });
    if (afdelingFilter != null) q = q.eq("companies.afdeling_nr", afdelingFilter);
    const { data, error } = await q;
    if (error) {
      toast.error("Kunne ikke hente salgsmuligheder");
      setLoading(false);
      return;
    }
    const rows = (data as unknown as Opportunity[]) ?? [];
    const ids = Array.from(
      new Set(rows.map((r) => r.assigned_to).filter(Boolean) as string[]),
    );
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      rows.forEach((r) => {
        if (r.assigned_to)
          r.profiles = { full_name: map.get(r.assigned_to) ?? "" };
      });
    }
    const quoteIds = Array.from(
      new Set(rows.map((r) => r.quote_id).filter(Boolean) as string[]),
    );
    if (quoteIds.length) {
      const [{ data: recs }, { data: tilbudRows }] = await Promise.all([
        supabase
          .from("quote_recipients")
          .select("quote_id,sendt_at,antal_aabninger,foerst_aabnet_at,seneste_aabnet_at")
          .in("quote_id", quoteIds),
        supabase
          .from("quotes")
          .select("id,quote_number,sent_date,status,pdf_path")
          .in("id", quoteIds),
      ]);
      const perQuote = new Map<string, ModtagerSporing[]>();
      (recs ?? []).forEach((r: any) => {
        const arr = perQuote.get(r.quote_id) ?? [];
        arr.push(r);
        perQuote.set(r.quote_id, arr);
      });
      const tilbudMap = new Map((tilbudRows ?? []).map((t) => [t.id, t]));
      rows.forEach((r) => {
        if (r.quote_id && perQuote.has(r.quote_id))
          r.modtagere = perQuote.get(r.quote_id);
        if (r.quote_id) r.tilbud = (tilbudMap.get(r.quote_id) as Opportunity["tilbud"]) ?? null;
      });
    }
    setItems(rows);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && user) load();
  }, [authLoading, user, afdelingFilter]);

  const filtrerede = useMemo(() => {
    return items.filter((o) => {
      if (isAdmin && saelgerFilter !== "__alle" && o.assigned_to !== saelgerFilter)
        return false;
      if (isAdmin && kildeFilter !== "__alle" && (o.kilde ?? "") !== kildeFilter)
        return false;
      return true;
    });
  }, [items, isAdmin, saelgerFilter, kildeFilter]);

  const saelgere = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((o) => {
      if (o.assigned_to) m.set(o.assigned_to, o.profiles?.full_name ?? "");
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const kilder = useMemo(
    () =>
      Array.from(new Set(items.map((o) => o.kilde).filter(Boolean) as string[])).sort(),
    [items],
  );

  const stats = useMemo(() => {
    const tilbud = filtrerede.filter((o) => o.status_v2 === "tilbud_sendt");
    const aabenPipeline = tilbud.reduce(
      (s, o) => s + Number(o.estimated_value ?? 0),
      0,
    );
    const om14 = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const moeder14 = filtrerede.filter(
      (o) =>
        o.status_v2 === "moede_booket" &&
        o.moede_at &&
        new Date(o.moede_at).getTime() >= Date.now() &&
        new Date(o.moede_at).getTime() <= om14,
    ).length;
    const won = filtrerede.filter((o) => o.status_v2 === "vundet").length;
    const lost = filtrerede.filter((o) => o.status_v2 === "tabt").length;
    const winRate = won + lost === 0 ? 0 : (won / (won + lost)) * 100;
    return { aabenPipeline, moeder14, winRate, won, lost };
  }, [filtrerede]);

  const byCol = useMemo(() => {
    const map: Record<Status, Opportunity[]> = {
      moede_booket: [],
      tilbud_sendt: [],
      vundet: [],
      tabt: [],
    };
    filtrerede.forEach((o) => {
      if (map[o.status_v2]) map[o.status_v2].push(o);
    });
    return map;
  }, [filtrerede]);

  return (
    <div className="px-4 md:px-8 py-6 pb-24 md:pb-8 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Salgsmuligheder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? "Hele teamets pipeline" : "Din pipeline"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Select value={saelgerFilter} onValueChange={setSaelgerFilter}>
              <SelectTrigger className="w-44" aria-label="Filtrér på sælger">
                <SelectValue placeholder="Alle sælgere" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__alle">Alle sælgere</SelectItem>
                {saelgere.map(([id, navn]) => (
                  <SelectItem key={id} value={id}>
                    {navn || "Ukendt"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kildeFilter} onValueChange={setKildeFilter}>
              <SelectTrigger className="w-40" aria-label="Filtrér på kilde">
                <SelectValue placeholder="Alle kilder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__alle">Alle kilder</SelectItem>
                {kilder.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k === "boost" ? "Boost" : k === "egen" ? "Egen" : k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Nøgletal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Åben pipeline (tilbud sendt)"
          value={dkk(stats.aabenPipeline)}
        />
        <StatCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Møder næste 14 dage"
          value={String(stats.moeder14)}
        />
        <StatCard
          icon={<Target className="h-5 w-5" />}
          label="Win rate"
          value={`${stats.winRate.toFixed(0)} %`}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4">
          {COLUMNS.map((col) => {
            const colItems = byCol[col.key] ?? [];
            const colTotal = colItems.reduce(
              (s, o) => s + Number(o.estimated_value ?? 0),
              0,
            );
            return (
              <div key={col.key} className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-sm">{col.label}</h2>
                    <Badge variant="secondary" className="text-xs">
                      {colItems.length}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {dkk(colTotal)}
                  </span>
                </div>
                <div className="bg-muted/40 rounded-lg p-2 space-y-2 min-h-[200px]">
                  {colItems.map((o) => (
                    <OpportunityCard
                      key={o.id}
                      opp={o}
                      onClick={() => setSelected(o)}
                    />
                  ))}
                  {colItems.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Ingen
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {/* Vundet/Tabt som tællere */}
          <div className="md:w-48 flex md:flex-col gap-3">
            <Card className="p-3 flex-1">
              <p className="text-xs text-muted-foreground">Vundet</p>
              <p className="text-2xl font-semibold">{stats.won}</p>
            </Card>
            <Card className="p-3 flex-1">
              <p className="text-xs text-muted-foreground">Tabt</p>
              <p className="text-2xl font-semibold">{stats.lost}</p>
            </Card>
          </div>
        </div>
      )}

      <OpportunityDrawer
        opp={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          load();
        }}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </Card>
  );
}

function OpportunityCard({
  opp,
  onClick,
}: {
  opp: Opportunity;
  onClick: () => void;
}) {
  const advarsel = advarselTekst(opp);
  const aabning =
    opp.status_v2 === "tilbud_sendt" && opp.quote_id
      ? tilbudAabningLinje(opp.modtagere ?? [], null)
      : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="w-full text-left bg-card border rounded-md p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
    >
      <p className="font-medium text-sm truncate">
        {opp.company_id ? (
          <Link
            to="/virksomheder/$id"
            params={{ id: opp.company_id }}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            {opp.companies?.name ?? "Ukendt virksomhed"}
          </Link>
        ) : (opp.companies?.name ?? "Ukendt virksomhed")}
      </p>
      {opp.moede_at && (
        <p className="text-xs mt-0.5 text-muted-foreground">
          Møde {fmtDato(opp.moede_at)}
          {opp.moede_udfald ? ` · ${MOEDE_UDFALD_LABEL[opp.moede_udfald]}` : ""}
        </p>
      )}
      {advarsel && <p className="text-xs mt-1 font-medium text-destructive">{advarsel}</p>}
      {aabning && (
        <p
          className={
            aabning.tone === "rod"
              ? "text-xs mt-1 font-medium text-destructive"
              : "text-xs mt-1 text-muted-foreground"
          }
        >
          {aabning.text}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        {opp.status_v2 === "tilbud_sendt" && !opp.quote_id ? (
          <span className="text-xs text-muted-foreground">Værdi mangler – opret tilbud</span>
        ) : (
          <span className="text-sm font-semibold">{dkk(opp.estimated_value)}</span>
        )}
        {opp.kilde && (
          <span className="text-[11px] text-muted-foreground">
            {opp.kilde === "boost" ? "Boost" : opp.kilde === "egen" ? "Egen" : opp.kilde}
          </span>
        )}
      </div>
      {opp.profiles?.full_name && (
        <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
          {opp.profiles.full_name}
        </p>
      )}
    </div>
  );
}

function OpportunityDrawer({
  opp,
  onClose,
  onSaved,
  isAdmin,
}: {
  opp: Opportunity | null;
  onClose: () => void;
  onSaved: () => void;
  isAdmin: boolean;
}) {
  const [form, setForm] = useState<Partial<Opportunity>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const hentPdf = useServerFn(hentTilbudPdf);

  useEffect(() => {
    if (opp) setForm(opp);
  }, [opp]);

  const remove = async () => {
    if (!opp) return;
    setDeleting(true);
    const { error } = await supabase
      .from("sales_opportunities")
      .delete()
      .eq("id", opp.id);
    setDeleting(false);
    if (error) {
      toast.error("Kunne ikke slette salgsmuligheden");
    } else {
      toast.success("Salgsmulighed slettet");
      onSaved();
    }
  };

  const save = async () => {
    if (!opp) return;
    const nyStatus = (form.status_v2 ?? opp.status_v2) as Status;
    const aaben = nyStatus === "moede_booket" || nyStatus === "tilbud_sendt";
    // Påkrævede valg
    if (opp.status_v2 === "moede_booket" && nyStatus !== "moede_booket" && !form.moede_udfald) {
      toast.error("Vælg mødets udfald før du flytter kortet ud af \"Møde booket\"");
      return;
    }
    if (aaben && !form.next_followup_date) {
      toast.error("Åbne muligheder skal have en opfølgningsdato");
      return;
    }
    if (nyStatus === "tabt" && !form.tabt_aarsag) {
      toast.error("Vælg en årsag til at salget er tabt");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("sales_opportunities")
      .update({
        name: form.name,
        opportunity_type: form.opportunity_type,
        status_v2: nyStatus,
        moede_udfald: form.moede_udfald ?? null,
        tabt_aarsag: nyStatus === "tabt" ? form.tabt_aarsag ?? null : null,
        next_action: form.next_action,
        next_followup_date: form.next_followup_date || null,
      } as never)
      .eq("id", opp.id);
    setSaving(false);
    if (error) {
      toast.error("Kunne ikke gemme");
    } else {
      toast.success("Salgsmulighed opdateret");
      onSaved();
    }
  };

  return (
    <Sheet open={!!opp} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {opp && (
          <>
            <SheetHeader>
              <SheetTitle>{opp.companies?.name ?? "Salgsmulighed"}</SheetTitle>
              <SheetDescription>
                {opp.profiles?.full_name
                  ? `Tildelt: ${opp.profiles.full_name}`
                  : "Ikke tildelt"}
                {opp.moede_at ? ` · Møde ${fmtDato(opp.moede_at)}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-6">
              <div>
                <Label>Navn</Label>
                <Input
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Input
                  value={form.opportunity_type ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, opportunity_type: e.target.value })
                  }
                  placeholder="Fx kaffemaskine, abonnement"
                />
              </div>
              <div>
                <Label>Værdi</Label>
                <p className="text-sm font-medium py-2">
                  {opp.quote_id
                    ? `${dkk(opp.estimated_value)} (fra tilbud)`
                    : "Sættes automatisk fra tilbuddet"}
                </p>
              </div>
              {opp.tilbud && (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-sm">
                    Tilbud {opp.tilbud.quote_number ?? "—"}
                    {opp.tilbud.sent_date
                      ? ` · sendt ${new Date(opp.tilbud.sent_date).toLocaleDateString("da-DK")}`
                      : ""}
                    {` · ${TILBUD_STATUS_LABEL[opp.tilbud.status] ?? opp.tilbud.status}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tilbudAabningLinje(opp.modtagere ?? [], null) ?? "Ikke åbnet"}
                  </p>
                  <div className="flex items-center gap-2">
                    {opp.tilbud.pdf_path && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setPdfOpen(true)}
                      >
                        <FileText className="h-3.5 w-3.5" /> Åbn PDF
                      </Button>
                    )}
                    <Link
                      to="/tilbud/$id"
                      params={{ id: opp.tilbud.id }}
                      className="text-sm text-primary underline underline-offset-2"
                    >
                      Gå til tilbud
                    </Link>
                  </div>
                </div>
              )}
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status_v2}
                  onValueChange={(v) =>
                    setForm({ ...form, status_v2: v as Status })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {opp.status_v2 === "moede_booket" && (
                <div>
                  <Label>
                    Mødets udfald
                    {form.status_v2 !== "moede_booket" ? " (påkrævet)" : ""}
                  </Label>
                  <Select
                    value={form.moede_udfald ?? ""}
                    onValueChange={(v) =>
                      setForm({ ...form, moede_udfald: v as MoedeUdfald })
                    }
                  >
                    <SelectTrigger aria-label="Mødets udfald">
                      <SelectValue placeholder="Vælg udfald" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MOEDE_UDFALD_LABEL) as MoedeUdfald[]).map((u) => (
                        <SelectItem key={u} value={u}>
                          {MOEDE_UDFALD_LABEL[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.status_v2 === "tabt" && (
                <div>
                  <Label>Årsag til tabt (påkrævet)</Label>
                  <Select
                    value={form.tabt_aarsag ?? ""}
                    onValueChange={(v) =>
                      setForm({ ...form, tabt_aarsag: v as TabtAarsag })
                    }
                  >
                    <SelectTrigger aria-label="Årsag til tabt">
                      <SelectValue placeholder="Vælg årsag" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TABT_AARSAG_LABEL) as TabtAarsag[]).map((a) => (
                        <SelectItem key={a} value={a}>
                          {TABT_AARSAG_LABEL[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Næste handling</Label>
                <Textarea
                  rows={2}
                  value={form.next_action ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, next_action: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>
                  Næste opfølgningsdato
                  {form.status_v2 === "moede_booket" || form.status_v2 === "tilbud_sendt"
                    ? " (påkrævet)"
                    : ""}
                </Label>
                <Input
                  type="date"
                  value={form.next_followup_date ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, next_followup_date: e.target.value })
                  }
                />
              </div>
            </div>

            <SheetFooter className="gap-2 sm:justify-between">
              {isAdmin ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={deleting}>
                      {deleting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Slet
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Slet salgsmulighed?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{opp.name}" bliver slettet permanent. Registrerede
                        aktiviteter og tilbud bevares, men mister tilknytningen.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annullér</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={remove}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Slet salgsmulighed
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Luk
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Gem ændringer
                </Button>
              </div>
            </SheetFooter>
            {opp.tilbud?.pdf_path && (
              <PDFViewerDialog
                open={pdfOpen}
                onClose={() => setPdfOpen(false)}
                filename={`Tilbud ${opp.tilbud.quote_number ?? ""}.pdf`}
                fetcher={() => hentPdf({ data: { quote_id: opp.tilbud!.id } })}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
