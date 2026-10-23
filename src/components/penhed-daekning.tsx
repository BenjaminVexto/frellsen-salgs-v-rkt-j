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
import {
  ForhandlerDialog,
  ForslagLinje,
  ViaForhandler,
  fjernIndirekte,
  hentKoblingsforslag,
  type Koblingsforslag,
} from "@/components/penhed-forhandler";

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
  kilde: "auto" | "manuel" | "afvist" | "indirekte" | null;
  link_delivery_no: string | null;
  via_company_id: string | null;
  via_company_name: string | null;
  via_note: string | null;
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
      .select("p_nummer, kilde, visma_delivery_no, via_company_id, note")
      .eq("afdeling_nr", afdelingNr)
      .in("p_nummer", pnrs);
    if (lErr) throw new Error(lErr.message);
    // Én kobling pr. P-enhed: manuel > auto > indirekte > afvist
    const pri: Record<string, number> = { manuel: 1, auto: 2, indirekte: 3, afvist: 4 };
    for (const l of lk ?? []) {
      const cur = links.get(l.p_nummer);
      if (!cur || (pri[l.kilde] ?? 9) < (pri[cur.kilde] ?? 9)) links.set(l.p_nummer, l);
    }
    const viaIds = Array.from(new Set([...links.values()].map((l: any) => l.via_company_id).filter(Boolean)));
    if (viaIds.length) {
      const { data: vc } = await supabase.from("companies").select("id, name").in("id", viaIds);
      const nm = new Map((vc ?? []).map((c: any) => [c.id, c.name]));
      for (const l of links.values()) if (l.via_company_id) l.via_company_name = nm.get(l.via_company_id) ?? null;
    }
  }
  const rows: PenhedDaekningRow[] = (pen ?? []).map((p: any) => {
    const l = links.get(p.p_number);
    const kilde = l?.kilde ?? null;
    return {
      ...p,
      kilde,
      link_delivery_no: l?.visma_delivery_no ?? null,
      via_company_id: kilde === "indirekte" ? l?.via_company_id ?? null : null,
      via_company_name: kilde === "indirekte" ? l?.via_company_name ?? null : null,
      via_note: kilde === "indirekte" ? l?.note ?? null : null,
      daekket: kilde === "auto" || kilde === "manuel" || kilde === "indirekte",
    };
  });
  rows.sort((a, b) => (b.ansatte_estimat ?? -1) - (a.ansatte_estimat ?? -1));
  return rows;
}

/** Logger hvem der gjorde hvad med en P-enhed (kobling/afkobling/ikke relevant). */
export async function logPenhed(
  p_nummer: string,
  handling: "kobl" | "fjern_kobling" | "ikke_relevant" | "fortryd_ikke_relevant",
  location_id: string | null = null,
  begrundelse: string | null = null,
) {
  const { error } = await (supabase as any)
    .from("penhed_handling_log")
    .insert({ p_nummer, handling, location_id, begrundelse });
  if (error) console.warn("P-enhed log fejlede:", error.message);
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
  kunIkkeKunde = false,
  visIkkeHosListe = true,
  skjulIndirekte = false,
}: {
  /** Skjul listen over P-enheder via forhandler (vises andetsteds). */
  skjulIndirekte?: boolean;
  cvr: string;
  afdelingNr: number;
  companyId?: string | null;
  companyName?: string | null;
  assignedTo?: string | null;
  onChanged?: () => void;
  visIkkeRelevante?: boolean;
  /** Vis kun P-enheder, vi ikke er hos (sorteret efter ansatte) — bruges under Lokationer. */
  kunIkkeKunde?: boolean;
  /** I kunIkkeKunde-mode: om listen over P-enheder vi ikke er hos er foldet ud. */
  visIkkeHosListe?: boolean;
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
  const [visAntal, setVisAntal] = useState(25);
  const [mobilMatch, setMobilMatch] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<PenhedDaekningRow[] | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [regioner, setRegioner] = useState<Region[]>([]);
  const [aabne, setAabne] = useState<Set<string>>(new Set());
  const [visDaekket, setVisDaekket] = useState(false);
  const [visMindre, setVisMindre] = useState(false);
  const [visMarkerede, setVisMarkerede] = useState(false);
  const [forhFor, setForhFor] = useState<PenhedDaekningRow | null>(null);
  const [forslag, setForslag] = useState<Map<string, Koblingsforslag[]>>(new Map());

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
      hentKoblingsforslag(cvr)
        .then((fs) => {
          const m = new Map<string, Koblingsforslag[]>();
          for (const f of fs) {
            if (f.afdeling_nr !== afdelingNr || !f.samme_cvr) continue;
            if (!m.has(f.p_nummer)) m.set(f.p_nummer, []);
            m.get(f.p_nummer)!.push(f);
          }
          setForslag(m);
        })
        .catch(() => setForslag(new Map()));
      const pnrs = r.map((x) => x.p_number);
      if (pnrs.length) {
        const [{ data: opp }, { data: ir }] = await Promise.all([
          (supabase as any)
            .from("sales_opportunities")
            .select("p_nummer, name, status_v2, assigned_to")
            .in("p_nummer", pnrs)
            .not("status_v2", "in", "(vundet,tabt)"),
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
            status: o.status_v2,
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
      { onConflict: "p_nummer,location_id" },
    );
    setBusy(null);
    if (error) return toast.error("Kunne ikke koble: " + error.message);
    await logPenhed(p.p_number, "kobl", loc.id);
    toast.success("P-enhed koblet");
    await load();
    onChanged?.();
  }

  async function fjern(p: PenhedDaekningRow) {
    setBusy(p.p_number);
    const { error } = await (supabase as any)
      .from("location_pnr_link")
      .update({ kilde: "afvist", oprettet_af: auth.user?.id, oprettet_dato: new Date().toISOString() })
      .eq("p_nummer", p.p_number)
      .eq("afdeling_nr", afdelingNr);
    setBusy(null);
    if (error) return toast.error("Kunne ikke fjerne: " + error.message);
    await logPenhed(p.p_number, "fjern_kobling");
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

  async function fortrydIndirekte(p: PenhedDaekningRow) {
    setBusy(p.p_number);
    try {
      await fjernIndirekte(p.p_number, afdelingNr);
      toast.success("Markering fortrudt");
    } catch (e: any) {
      toast.error("Kunne ikke fortryde: " + (e?.message ?? String(e)));
    }
    setBusy(null);
    await load();
    onChanged?.();
  }

  const genindlaes = async () => {
    await load();
    onChanged?.();
  };

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
    if (!irFor) return;
    // Under Lokationer: kun en valgfri kort begrundelse. Ellers årsagsliste.
    const tekst = irTekst.trim();
    const aarsag = kunIkkeKunde ? (tekst ? "andet" : "uden_aarsag") : irAarsag;
    if (!aarsag) return;
    if (aarsag === "andet" && !tekst) return toast.error("Skriv en årsag");
    const p = irFor;
    setBusy(p.p_number);
    const { error } = await (supabase as any).from("penhed_ikke_relevant").upsert(
      {
        p_nummer: p.p_number,
        aarsag,
        fritekst: aarsag === "andet" ? tekst : null,
        created_by: auth.user?.id,
        created_at: new Date().toISOString(),
      },
      { onConflict: "p_nummer" },
    );
    setBusy(null);
    if (error) return toast.error("Kunne ikke markere: " + error.message);
    await logPenhed(p.p_number, "ikke_relevant", null, tekst || null);
    setIrFor(null);
    toast.success("Markeret som ikke relevant");
    await load();
    onChanged?.();
  }

  async function fortrydIkkeRelevant(p: PenhedDaekningRow) {
    setBusy(p.p_number);
    const { error } = await (supabase as any)
      .from("penhed_ikke_relevant")
      .delete()
      .eq("p_nummer", p.p_number);
    setBusy(null);
    if (error) return toast.error("Kunne ikke fortryde: " + error.message);
    await logPenhed(p.p_number, "fortryd_ikke_relevant");
    toast.success("Markering fortrudt");
    await load();
    onChanged?.();
  }

  if (kunIkkeKunde && (!rows || !rows.length)) {
    return !rows && visIkkeHosListe ? (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Henter P-enheder…
      </div>
    ) : null;
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
          {p.kilde === "indirekte" && p.via_company_id && (
            <div className="text-[11px] text-muted-foreground" title={p.via_note ?? undefined}>
              <ViaForhandler id={p.via_company_id} navn={p.via_company_name} />
            </div>
          )}
          {!dk && <ForslagLinje forslag={forslag.get(p.p_number) ?? []} onDone={genindlaes} />}
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
          {dk ? (p.kilde === "indirekte" ? "via forhandler" : p.link_delivery_no ?? "–") : ""}
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
                  {p.kilde === "indirekte" ? (
                    <button
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                      onClick={() => fortrydIndirekte(p)}
                    >
                      Fortryd "Leveres via forhandler"
                    </button>
                  ) : p.daekket ? (
                    <button
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                      onClick={() => fjern(p)}
                    >
                      Fjern kobling
                    </button>
                  ) : (
                    <>
                      {companyId && (
                        <button
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                          onClick={() => setForhFor(p)}
                        >
                          Leveres via forhandler…
                        </button>
                      )}
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

  const dialoger = (
    <>
    <ForhandlerDialog
      penhed={forhFor}
      afdelingNr={afdelingNr}
      companyId={companyId}
      onClose={() => setForhFor(null)}
      onSaved={() => {
        setForhFor(null);
        genindlaes();
      }}
    />
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
        {kunIkkeKunde ? (
          <div className="space-y-1.5">
            {irFor && (
              <p className="text-sm text-muted-foreground">
                {[irFor.address, irFor.zip, irFor.city].filter(Boolean).join(", ")} · P-nr. {irFor.p_number}
              </p>
            )}
            <Label>Kort begrundelse (valgfri)</Label>
            <Textarea
              value={irTekst}
              onChange={(e) => setIrTekst(e.target.value)}
              placeholder="Fx lager uden medarbejdere eller kaffebehov"
              rows={2}
              maxLength={200}
            />
          </div>
        ) : (
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
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setIrFor(null)}>Annullér</Button>
          <Button
            onClick={markerIkkeRelevant}
            disabled={
              busy != null ||
              (!kunIkkeKunde && (!irAarsag || (irAarsag === "andet" && !irTekst.trim())))
            }
          >
            Markér
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );

  if (kunIkkeKunde) {
    const markerede = rows.filter((r) => !r.daekket && ikkeRel.has(r.p_number));
    const indirekte = rows.filter((r) => r.kilde === "indirekte");
    const begrundelse = (pn: string) => {
      const x = ikkeRel.get(pn);
      if (!x || x.aarsag === "uden_aarsag") return null;
      return x.aarsag === "andet" ? x.fritekst : IKKE_RELEVANT_AARSAGER.find((a) => a.key === x.aarsag)?.label ?? null;
    };
    const linje = (p: PenhedDaekningRow) => (
      <>
        <div className="font-medium">{p.address ?? "Ukendt adresse"}</div>
        <div className="text-xs text-muted-foreground">
          {[[p.zip, p.city].filter(Boolean).join(" "), `P-nr. ${p.p_number}`, `${formatAnsatte(p)} ansatte`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </>
    );
    return (
      <>
        {visIkkeHosListe && (
        <ul className="divide-y">
          {ikke.slice(0, visAntal).map((p) => {
            const mOpen = mobilMatch.has(p.p_number);
            const nForslag = (forslag.get(p.p_number) ?? []).length;
            return (
            <li key={p.p_number} className="py-2 text-sm">
              <div className="hidden md:block">{linje(p)}</div>
              <div className="md:hidden truncate">
                {[p.address ?? "Ukendt adresse", `P-nr. ${p.p_number}`, `${formatAnsatte(p)} ansatte`].join(" · ")}
              </div>
              <button
                type="button"
                className="md:hidden min-h-11 text-xs text-primary inline-flex items-center"
                aria-expanded={mOpen}
                onClick={() => setMobilMatch((s) => { const n = new Set(s); if (n.has(p.p_number)) n.delete(p.p_number); else n.add(p.p_number); return n; })}
              >
                {mOpen ? "Skjul mulige match" : `Vis mulige match (${nForslag})`}
              </button>
              <div className={mOpen ? "" : "max-md:hidden"}>
              {busy === p.p_number ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mt-1" />
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 max-md:[&_button]:min-h-11">
                  {aabneInfo.has(p.p_number) ? (
                    <span className="text-xs text-muted-foreground">
                      Salgsmulighed: {aabneInfo.get(p.p_number)!.saelger ?? "uden sælger"} ·{" "}
                      {STADIE_LABEL[aabneInfo.get(p.p_number)!.status] ?? aabneInfo.get(p.p_number)!.status}
                    </span>
                  ) : companyId ? (
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        if (kanStyre) {
                          setTildelTil(assignedTo ?? "");
                          setTildelFor(p);
                        } else opretMulighed(p);
                      }}
                    >
                      {kanStyre ? "Tildel sælger" : "Opret salgsmulighed"}
                    </button>
                  ) : null}
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    onClick={() => {
                      setIrTekst("");
                      setIrFor(p);
                    }}
                  >
                    Markér ikke relevant
                  </button>
                  {companyId && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => setForhFor(p)}
                    >
                      Leveres via forhandler…
                    </button>
                  )}
                </div>
              )}
              <ForslagLinje forslag={forslag.get(p.p_number) ?? []} onDone={genindlaes} />
              </div>
            </li>
            );
          })}
        </ul>
        )}
        {visIkkeHosListe && ikke.length > visAntal && <Button variant="ghost" size="sm" onClick={() => setVisAntal((n) => n + 25)}>Vis flere ({ikke.length - visAntal} tilbage)</Button>}
        {!skjulIndirekte && indirekte.length > 0 && (
          <ul className="divide-y mt-2">
            {indirekte.map((p) => (
              <li key={p.p_number} className="py-2 text-sm text-muted-foreground">
                {linje(p)}
                <div className="text-xs mt-0.5 flex flex-wrap gap-x-2">
                  {p.via_company_id && <ViaForhandler id={p.via_company_id} navn={p.via_company_name} />}
                  {p.via_note && <span>· {p.via_note}</span>}
                  {busy === p.p_number ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <button className="hover:text-foreground hover:underline" onClick={() => fortrydIndirekte(p)}>
                      Fortryd
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {markerede.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={visMarkerede}
              onClick={() => setVisMarkerede((v) => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {markerede.length} markeret ikke relevant {visMarkerede ? "▾" : "▸"}
            </button>
            {visMarkerede && (
              <ul className="divide-y mt-1">
                {markerede.map((p) => (
                  <li key={p.p_number} className="py-2 text-sm text-muted-foreground">
                    {linje(p)}
                    {begrundelse(p.p_number) && (
                      <div className="text-xs mt-0.5">Begrundelse: {begrundelse(p.p_number)}</div>
                    )}
                    {busy === p.p_number ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mt-1" />
                    ) : (
                      <button
                        className="text-xs text-primary hover:underline mt-0.5"
                        onClick={() => fortrydIkkeRelevant(p)}
                      >
                        Fortryd
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {dialoger}
      </>
    );
  }

  return (
    <>
    <div className="overflow-x-auto">
    <table className="w-full min-w-[600px] text-sm table-fixed">
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
        {kunIkkeKunde && ikke.map((p) => <Row key={p.p_number} p={p} dk={false} />)}
        {!kunIkkeKunde && (<>
        <tr>
          <td colSpan={6}>
            <button className={toggleCls} onClick={() => setVisDaekket((v) => !v)}>
              Kunde hos os: {daekket.length} P-enheder · {daekketAnsatte} ansatte
              {visDaekket ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </td>
        </tr>
        {visDaekket && daekket.map((p) => <Row key={p.p_number} p={p} dk />)}
        <tr>
          <td colSpan={6} className="pt-2 text-xs font-medium text-muted-foreground py-1">
            Ikke kunde endnu ({ikke.length})
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
        </>)}
      </tbody>
    </table>
    </div>
    {dialoger}
    </>
  );
}
