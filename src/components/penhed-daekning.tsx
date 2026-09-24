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

/** Samme grænse som flammen i Salgsintelligens. */
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
}: {
  cvr: string;
  afdelingNr: number;
  companyId?: string | null;
  companyName?: string | null;
  assignedTo?: string | null;
  onChanged?: () => void;
}) {
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
      if (companyId) {
        const { data: opp } = await supabase
          .from("sales_opportunities")
          .select("name, status")
          .eq("company_id", companyId)
          .not("status", "in", "(vundet,tabt)");
        const s = new Set<string>();
        for (const o of opp ?? []) {
          const m = /P-nr (\d+)/.exec(o.name ?? "");
          if (m) s.add(m[1]);
        }
        setAabne(s);
      }
    } catch (e: any) {
      toast.error("Kunne ikke hente P-enheder: " + (e?.message ?? String(e)));
      setRows([]);
    }
  }, [cvr, afdelingNr, companyId]);

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
    });
    setBusy(null);
    if (error) return toast.error("Kunne ikke oprette: " + error.message);
    toast.success("Salgsmulighed oprettet");
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
  const ikke = rows.filter((r) => !r.daekket);
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
        <td className="py-1 pr-3">
          <span>{p.address ?? "Ukendt adresse"}</span>
          {visNavn && (
            <span className="ml-2 text-[11px] text-muted-foreground">{p.name}</span>
          )}
          {aabne.has(p.p_number) && (
            <Badge variant="outline" className="ml-2 h-4 px-1.5 text-[10px] font-normal">
              Salgsmulighed
            </Badge>
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
              {companyId && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => opretMulighed(p)}
                >
                  Opret salgsmulighed
                </button>
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
    <table className="w-full text-sm table-fixed">
      <colgroup>
        <col className="w-48" />
        <col />
        <col className="w-28" />
        <col className="w-20" />
        <col className="w-28" />
        <col className="w-44" />
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
  );
}
