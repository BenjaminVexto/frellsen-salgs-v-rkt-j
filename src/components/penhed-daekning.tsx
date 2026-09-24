import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MoreHorizontal, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

export const STADIE_LABEL: Record<string, string> = {
  emne: "Emne",
  ny: "Ny",
  behovsafdækning: "Behovsafdækning",
  møde_demo: "Møde booket",
  tilbud_under_udarbejdelse: "Tilbud under udarbejdelse",
  tilbud_sendt: "Tilbud sendt",
  opfølgning: "Opfølgning",
  sat_på_pause: "Sat på pause",
  vundet: "Vundet",
  tabt: "Tabt",
};

export const IKKE_RELEVANT_AARSAGER: { key: string; label: string }[] = [
  { key: "kantine_anden_kunde", label: "Kantine/drift hos anden kunde" },
  { key: "centralt_indkoeb", label: "Centralt indkøb via hovedkontor" },
  { key: "frivillig_ingen_ansatte", label: "Frivillig/ingen ansatte" },
  { key: "andet", label: "Andet" },
];

/** "Claus Wolsing" → "CWO": fornavnets forbogstav + efternavnets to første. */
export function initialer(navn: string | null | undefined) {
  const d = (navn ?? "").trim().split(/\s+/).filter(Boolean);
  if (!d.length) return "?";
  if (d.length === 1) return d[0].slice(0, 3).toUpperCase();
  return (d[0][0] + d[d.length - 1].slice(0, 2)).toUpperCase();
}

export type PenhedDaekningRow = {
  p_number: string;
  name: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  ansatte_interval: string | null;
  ansatte_praecis: number | null;
  ansatte_estimat: number | null;
  kilde: "auto" | "manuel" | "afvist" | null;
  link_delivery_no: string | null;
  daekket: boolean;
};

type Loc = {
  id: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  visma_delivery_no: string | null;
};

export function formatAnsatte(p: {
  ansatte_praecis: number | null;
  ansatte_interval: string | null;
}) {
  if (p.ansatte_praecis != null) return String(p.ansatte_praecis);
  if (p.ansatte_interval) return p.ansatte_interval.replace("-", "–");
  return "–";
}

/** Henter aktive P-enheder for et CVR med dækning i én afdeling. */
export async function hentPenhedDaekning(cvr: string, afdelingNr: number) {
  const { data: pen, error } = await (supabase as any)
    .from("cvr_penheder")
    .select(
      "p_number, name, address, zip, city, ansatte_interval, ansatte_praecis, ansatte_estimat",
    )
    .eq("cvr", cvr)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const pnrs = (pen ?? []).map((p: any) => p.p_number);
  const links = new Map<string, any>();
  if (pnrs.length) {
    const { data: lk, error: lErr } = await (supabase as any)
      .from("location_pnr_link")
      .select("p_nummer, kilde, visma_delivery_no")
      .eq("afdeling_nr", afdelingNr)
      .in("p_nummer", pnrs);
    if (lErr) throw new Error(lErr.message);
    for (const l of lk ?? []) links.set(l.p_nummer, l);
  }
  const rows: PenhedDaekningRow[] = (pen ?? []).map((p: any) => {
    const l = links.get(p.p_number);
    const kilde = l?.kilde ?? null;
    return {
      ...p,
      kilde,
      link_delivery_no: l?.visma_delivery_no ?? null,
      daekket: kilde === "auto" || kilde === "manuel",
    };
  });
  rows.sort((a, b) => (b.ansatte_estimat ?? -1) - (a.ansatte_estimat ?? -1));
  return rows;
}

/** Samme grænse som flammen i Afdelingspotentiale. */
export const STOR_AFDELING_MIN_ANSATTE = 25;

type Region = { postnr_fra: number; postnr_til: number; region: string };

function distriktFor(zip: string | null, regioner: Region[]): string | null {
  const n = zip ? parseInt(zip, 10) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = regioner.find((x) => n >= x.postnr_fra && n <= x.postnr_til)?.region;
  if (!r) return null;
  if (r === "Hovedstaden" || r === "Sjælland") return "Sjælland";
  if (r === "Syddanmark") return n >= 5000 && n <= 5999 ? "Fyn" : "Jylland";
  return "Jylland";
}

export function PenhedDaekning({
  cvr,
  afdelingNr,
  companyId,
  companyName,
  assignedTo,
  onChanged,
  visIkkeRelevante = false,
}: {
  cvr: string;
  afdelingNr: number;
  companyId?: string | null;
  companyName?: string | null;
  assignedTo?: string | null;
  onChanged?: () => void;
  visIkkeRelevante?: boolean;
}) {
  const auth = useAuth();
  const kanStyre = auth.maaSeAfdelingspotentiale;
  const [aabneInfo, setAabneInfo] = useState<Map<string, { saelger: string | null; status: string }>>(new Map());
  const [ikkeRel, setIkkeRel] = useState<Map<string, { aarsag: string; fritekst: string | null }>>(new Map());
  const [saelgere, setSaelgere] = useState<{ id: string; full_name: string }[]>([]);
  const [tildelFor, setTildelFor] = useState<PenhedDaekningRow | null>(null);
  const [tildelTil, setTildelTil] = useState<string>("");
  const [irFor, setIrFor] = useState<PenhedDaekningRow | null>(null);
  const [irAarsag, setIrAarsag] = useState<string>("");
  const [irTekst, setIrTekst] = useState("");
  const [rows, setRows] = useState<PenhedDaekningRow[] | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [regioner, setRegioner] = useState<Region[]>([]);
  const [aabne, setAabne] = useState<Set<string>>(new Set());
  const [visDaekket, setVisDaekket] = useState(false);
  const [visMindre, setVisMindre] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from("postnummer_region")
      .select("postnr_fra, postnr_til, region")
      .then(({ data }: any) => setRegioner(data ?? []));
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setSaelgere((data ?? []) as any));
  }, []);

  const load = useCallback(async () => {
    try {
      const [r, l] = await Promise.all([
        hentPenhedDaekning(cvr, afdelingNr),
        (async () => {
          const { data: comps } = await supabase
            .from("companies")
            .select("id")
            .eq("cvr", cvr)
            .eq("afdeling_nr", afdelingNr);
          const ids = (comps ?? []).map((c: any) => c.id);
          if (!ids.length) return [] as Loc[];
          const { data } = await supabase
            .from("locations")
            .select("id, address, zip, city, visma_delivery_no")
            .in("company_id", ids)
            .not("visma_delivery_no", "is", null)
            .order("address");
          return (data ?? []) as Loc[];
        })(),
      ]);
      setRows(r);
      setLocs(l);
      const pnrs = r.map((x) => x.p_number);
      if (pnrs.length) {
        const [{ data: opp }, { data: ir }] = await Promise.all([
          (supabase as any)
            .from("sales_opportunities")
            .select("p_nummer, name, status, assigned_to")
            .in("p_nummer", pnrs)
            .not("status", "in", "(vundet,tabt)"),
          (supabase as any)
            .from("penhed_ikke_relevant")
            .select("p_nummer, aarsag, fritekst")
            .in("p_nummer", pnrs),
        ]);
        const ids = Array.from(new Set(((opp ?? []) as any[]).map((o) => o.assigned_to).filter(Boolean)));
        const navne = new Map<string, string>();
        if (ids.length) {
          const { data: pr } = await supabase.from("profiles").select("id, full_name").in("id", ids);
          for (const x of pr ?? []) navne.set(x.id, x.full_name);
        }
        const m = new Map<string, { saelger: string | null; status: string }>();
        for (const o of (opp ?? []) as any[]) {
          m.set(o.p_nummer, {
            saelger: o.assigned_to ? navne.get(o.assigned_to) ?? null : null,
            status: o.status,
          });
        }
        setAabneInfo(m);
        const im = new Map<string, { aarsag: string; fritekst: string | null }>();
        for (const x of (ir ?? []) as any[]) im.set(x.p_nummer, x);
        setIkkeRel(im);
      }
    } catch (e: any) {
      toast.error("Kunne ikke hente P-enheder: " + (e?.message ?? String(e)));
      setRows([]);
    }
  }, [cvr, afdelingNr]);

  useEffect(() => {
    load();
  }, [load]);

  async function kobl(p: PenhedDaekningRow, loc: Loc) {
    setBusy(p.p_number);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("location_pnr_link").upsert(
      {
        p_nummer: p.p_number,
        afdeling_nr: afdelingNr,
        visma_delivery_no: loc.visma_delivery_no,
        location_id: loc.id,
        kilde: "manuel",
        oprettet_af: u.user?.id,
        oprettet_dato: new Date().toISOString(),
      },
      { onConflict: "p_nummer,afdeling_nr" },
    );
    setBusy(null);
    if (error) return toast.error("Kunne ikke koble: " + error.message);
    toast.success("P-enhed koblet");
    await load();
    onChanged?.();
  }

  async function fjern(p: PenhedDaekningRow) {
    setBusy(p.p_number);
    const { error } = await (supabase as any)
      .from("location_pnr_link")
      .update({ kilde: "afvist" })
      .eq("p_nummer", p.p_number)
      .eq("afdeling_nr", afdelingNr);
    setBusy(null);
    if (error) return toast.error("Kunne ikke fjerne: " + error.message);
    toast.success("Kobling fjernet");
    await load();
    onChanged?.();
  }

  async function fortryd(p: PenhedDaekningRow) {
    setBusy(p.p_number);
    const q = (supabase as any).from("location_pnr_link");
    const { error } = p.link_delivery_no
      ? await q
          .update({ kilde: "manuel" })
          .eq("p_nummer", p.p_number)
          .eq("afdeling_nr", afdelingNr)
      : await q.delete().eq("p_nummer", p.p_number).eq("afdeling_nr", afdelingNr);
    setBusy(null);
    if (error) return toast.error("Kunne ikke fortryde: " + error.message);
    toast.success("Afvisning fortrudt");
    await load();
    onChanged?.();
  }

  async function opretMulighed(p: PenhedDaekningRow) {
    if (!companyId) return toast.error("Mangler virksomhed");
    setBusy(p.p_number);
    const ans = formatAnsatte(p);
    const { error } = await supabase.from("sales_opportunities").insert({
      company_id: companyId,
      assigned_to: assignedTo ?? null,
      name: `${[p.address, p.zip, p.city].filter(Boolean).join(", ")} (P-nr ${p.p_number})`,
      next_action: `P-enhed ${p.p_number} · ${ans} ansatte`,
      p_nummer: p.p_number,
      kilde: "Afdelingspotentiale",
      created_by: auth.user?.id ?? null,
      ansatte_estimat: p.ansatte_estimat,
    } as any);
    setBusy(null);
    if (error) return toast.error("Kunne ikke oprette: " + error.message);
    toast.success("Salgsmulighed oprettet");
    await load();
    onChanged?.();
  }

  async function tildel() {
    if (!tildelFor || !companyId || !tildelTil) return;
    const p = tildelFor;
    setBusy(p.p_number);
    const { error } = await (supabase as any).rpc("tildel_penhed", {
      _company_id: companyId,
      _p_nummer: p.p_number,
      _saelger: tildelTil,
    });
    setBusy(null);
    if (error) return toast.error("Kunne ikke tildele: " + error.message);
    setTildelFor(null);
    toast.success("Emne oprettet i Salgsmuligheder");
    await load();
    onChanged?.();
  }

  async function markerIkkeRelevant() {
    if (!irFor || !irAarsag) return;
    if (irAarsag === "andet" && !irTekst.trim()) return toast.error("Skriv en årsag");
    const p = irFor;
    setBusy(p.p_number);
    const { error } = await (supabase as any).from("penhed_ikke_relevant").upsert(
      {
        p_nummer: p.p_number,
        aarsag: irAarsag,
        fritekst: irAarsag === "andet" ? irTekst.trim() : null,
        created_by: auth.user?.id,
        created_at: new Date().toISOString(),
      },
      { onConflict: "p_nummer" },
    );
    setBusy(null);
    if (error) return toast.error("Kunne ikke markere: " + error.message);
    setIrFor(null);
    toast.success("Markeret som ikke relevant");
    await load();
  }

  async function fortrydIkkeRelevant(p: PenhedDaekningRow) {
    setBusy(p.p_number);
    const { error } = await (supabase as any)
      .from("penhed_ikke_relevant")
      .delete()
      .eq("p_nummer", p.p_number);
    setBusy(null);
    if (error) return toast.error("Kunne ikke fortryde: " + error.message);
    toast.success("Markering fortrudt");
    await load();
  }

  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter P-enheder…
      </div>
    );
  }
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">Ingen aktive P-enheder på CVR.</p>;
  }

  const daekket = rows.filter((r) => r.daekket);
  const ikke = rows.filter(
    (r) => !r.daekket && (visIkkeRelevante || !ikkeRel.has(r.p_number)),
  );
  const skjulteIkkeRel = rows.filter((r) => !r.daekket && ikkeRel.has(r.p_number)).length;
  const store = ikke.filter((r) => (r.ansatte_estimat ?? -1) >= STOR_AFDELING_MIN_ANSATTE);
  const mindre = ikke
    .filter((r) => (r.ansatte_estimat ?? -1) < STOR_AFDELING_MIN_ANSATTE)
    .sort((a, b) => {
      if (a.ansatte_estimat == null && b.ansatte_estimat != null) return 1;
      if (b.ansatte_estimat == null && a.ansatte_estimat != null) return -1;
      return (b.ansatte_estimat ?? 0) - (a.ansatte_estimat ?? 0);
    });
  const daekketAnsatte = daekket.reduce((s, r) => s + (r.ansatte_estimat ?? 0), 0);
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  const Row = ({ p, dk }: { p: PenhedDaekningRow; dk: boolean }) => {
    const distrikt = distriktFor(p.zip, regioner);
    const visNavn = p.name && norm(p.name) !== norm(companyName);
    return (
      <tr className="group border-t first:border-t-0 hover:bg-muted/40">
        <td className="py-1 pr-3 whitespace-nowrap">
          {[p.zip, p.city].filter(Boolean).join(" ") || "–"}
          {distrikt && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">{distrikt}</span>
          )}
        </td>
        <td className="py-1 pr-3 min-w-0">
          <div className="truncate" title={p.address ?? undefined}>{p.address ?? "Ukendt adresse"}</div>
          {visNavn && (
            <div className="truncate text-[11px] text-muted-foreground" title={p.name ?? undefined}>{p.name}</div>
          )}
          {aabneInfo.has(p.p_number) ? (
            <span className="ml-2 text-[11px] text-muted-foreground">
              {initialer(aabneInfo.get(p.p_number)!.saelger)} ·{" "}
              {STADIE_LABEL[aabneInfo.get(p.p_number)!.status] ?? aabneInfo.get(p.p_number)!.status}
            </span>
          ) : (
            aabne.has(p.p_number) && (
              <Badge variant="outline" className="ml-2 h-4 px-1.5 text-[10px] font-normal">
                Salgsmulighed
              </Badge>
            )
          )}
          {ikkeRel.has(p.p_number) && (
            <span className="ml-2 text-[11px] text-muted-foreground">
              Ikke relevant ·{" "}
              {ikkeRel.get(p.p_number)!.aarsag === "andet"
                ? ikkeRel.get(p.p_number)!.fritekst
                : IKKE_RELEVANT_AARSAGER.find((a) => a.key === ikkeRel.get(p.p_number)!.aarsag)?.label}
            </span>
          )}
        </td>
        <td className="py-1 pr-3 text-muted-foreground tabular-nums">{p.p_number}</td>
        <td className="py-1 pr-3 text-right tabular-nums">{formatAnsatte(p)}</td>
        <td className="py-1 pr-3 text-muted-foreground tabular-nums">
          {dk ? (p.link_delivery_no ?? "–") : ""}
        </td>
        <td className="py-1 text-right whitespace-nowrap w-40">
          {busy === p.p_number ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
          ) : (
            <span className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
              {companyId && !dk && !aabneInfo.has(p.p_number) && !ikkeRel.has(p.p_number) && (
                kanStyre ? (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    onClick={() => {
                      setTildelTil(assignedTo ?? "");
                      setTildelFor(p);
                    }}
                  >
                    Tildel sælger
                  </button>
                ) : (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    onClick={() => opretMulighed(p)}
                  >
                    Opret salgsmulighed
                  </button>
                )
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-0.5 rounded hover:bg-muted" aria-label="Flere handlinger">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-1 max-h-72 overflow-y-auto" align="end">
                  {p.daekket ? (
                    <button
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                      onClick={() => fjern(p)}
                    >
                      Fjern kobling
                    </button>
                  ) : (
                    <>
                      {kanStyre && !ikkeRel.has(p.p_number) && (
                        <button
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                          onClick={() => {
                            setIrAarsag("");
                            setIrTekst("");
                            setIrFor(p);
                          }}
                        >
                          Markér ikke relevant
                        </button>
                      )}
                      {kanStyre && ikkeRel.has(p.p_number) && (
                        <button
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                          onClick={() => fortrydIkkeRelevant(p)}
                        >
                          Fortryd ikke relevant
                        </button>
                      )}
                      {p.kilde === "afvist" && (
                        <button
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                          onClick={() => fortryd(p)}
                        >
                          Fortryd afvisning
                        </button>
                      )}
                      <div className="text-[11px] text-muted-foreground px-2 pt-1.5 pb-1">
                        Kobl til kunde
                      </div>
                      {locs.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 pb-2">
                          Ingen leveringsadresser med Visma-nr. på kunden.
                        </p>
                      ) : (
                        locs.map((l) => (
                          <button
                            key={l.id}
                            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                            onClick={() => kobl(p, l)}
                          >
                            <div>{l.address ?? "(uden adresse)"}</div>
                            <div className="text-muted-foreground">
                              {[l.zip, l.city].filter(Boolean).join(" ")} · {l.visma_delivery_no}
                            </div>
                          </button>
                        ))
                      )}
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </span>
          )}
        </td>
      </tr>
    );
  };

  const toggleCls =
    "flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground py-1";

  return (
    <>
    <table className="w-full text-sm table-fixed">
      <colgroup>
        <col className="w-40" />
        <col />
        <col className="w-24" />
        <col className="w-16" />
        <col className="w-24" />
        <col className="w-32" />
      </colgroup>
      <thead className="text-[11px] text-muted-foreground">
        <tr>
          <th className="text-left font-normal pr-3">By</th>
          <th className="text-left font-normal pr-3">Adresse</th>
          <th className="text-left font-normal pr-3">P-nr</th>
          <th className="text-right font-normal pr-3">Ansatte</th>
          <th className="text-left font-normal pr-3">Visma-kundenr</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr>
          <td colSpan={6}>
            <button className={toggleCls} onClick={() => setVisDaekket((v) => !v)}>
              Dækket: {daekket.length} afd. · {daekketAnsatte} ansatte
              {visDaekket ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </td>
        </tr>
        {visDaekket && daekket.map((p) => <Row key={p.p_number} p={p} dk />)}
        <tr>
          <td colSpan={6} className="pt-2 text-xs font-medium text-muted-foreground py-1">
            Ikke dækket ({ikke.length})
            {!visIkkeRelevante && skjulteIkkeRel > 0 && (
              <span className="ml-2 font-normal">· {skjulteIkkeRel} ikke relevante skjult</span>
            )}
          </td>
        </tr>
        {store.map((p) => <Row key={p.p_number} p={p} dk={false} />)}
        {mindre.length > 0 && (
          <tr>
            <td colSpan={6}>
              <button className={toggleCls} onClick={() => setVisMindre((v) => !v)}>
                {visMindre ? "Skjul" : "Vis"} {mindre.length} mindre afdelinger
                {visMindre ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            </td>
          </tr>
        )}
        {visMindre && mindre.map((p) => <Row key={p.p_number} p={p} dk={false} />)}
      </tbody>
    </table>
    <Dialog open={!!tildelFor} onOpenChange={(o) => !o && setTildelFor(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tildel sælger</DialogTitle>
        </DialogHeader>
        {tildelFor && (
          <p className="text-sm text-muted-foreground">
            {[tildelFor.address, tildelFor.zip, tildelFor.city].filter(Boolean).join(", ")} · P-nr{" "}
            {tildelFor.p_number} · {formatAnsatte(tildelFor)} ansatte
          </p>
        )}
        <div className="space-y-1.5">
          <Label>Sælger</Label>
          <Select value={tildelTil} onValueChange={setTildelTil}>
            <SelectTrigger><SelectValue placeholder="Vælg sælger" /></SelectTrigger>
            <SelectContent>
              {saelgere.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Opretter et emne i Salgsmuligheder. Status styres derefter dér.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTildelFor(null)}>Annullér</Button>
          <Button onClick={tildel} disabled={!tildelTil || busy != null}>Tildel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!irFor} onOpenChange={(o) => !o && setIrFor(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Markér ikke relevant</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Årsag</Label>
          <Select value={irAarsag} onValueChange={setIrAarsag}>
            <SelectTrigger><SelectValue placeholder="Vælg årsag" /></SelectTrigger>
            <SelectContent>
              {IKKE_RELEVANT_AARSAGER.map((a) => (
                <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {irAarsag === "andet" && (
            <Textarea
              value={irTekst}
              onChange={(e) => setIrTekst(e.target.value)}
              placeholder="Skriv årsagen"
              rows={2}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIrFor(null)}>Annullér</Button>
          <Button
            onClick={markerIkkeRelevant}
            disabled={!irAarsag || (irAarsag === "andet" && !irTekst.trim()) || busy != null}
          >
            Markér
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
