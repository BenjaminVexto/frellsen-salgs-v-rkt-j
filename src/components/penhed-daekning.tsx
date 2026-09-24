import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
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

export function PenhedDaekning({
  cvr,
  afdelingNr,
  onChanged,
}: {
  cvr: string;
  afdelingNr: number;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<PenhedDaekningRow[] | null>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

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
  const locByNo = new Map(locs.map((l) => [l.visma_delivery_no, l]));

  const linkBtn = "text-xs text-muted-foreground hover:text-foreground hover:underline";

  const Row = ({ p, visKundenr }: { p: PenhedDaekningRow; visKundenr: boolean }) => (
    <tr className="border-t first:border-t-0">
      <td className="py-1.5 pr-3">
        <div>{p.address ?? "Ukendt adresse"}</div>
        {p.name && <div className="text-xs text-muted-foreground">{p.name}</div>}
      </td>
      <td className="py-1.5 pr-3 text-muted-foreground">
        {[p.zip, p.city].filter(Boolean).join(" ")}
      </td>
      <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">{p.p_number}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{formatAnsatte(p)}</td>
      {visKundenr && (
        <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">
          {p.link_delivery_no ?? "–"}
          {p.link_delivery_no && !locByNo.has(p.link_delivery_no) && ""}
        </td>
      )}
      <td className="py-1.5 text-right whitespace-nowrap">
        {busy === p.p_number ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
        ) : p.daekket ? (
          <button className={linkBtn} onClick={() => fjern(p)}>
            Fjern kobling
          </button>
        ) : (
          <span className="inline-flex gap-3">
            {p.kilde === "afvist" && (
              <button className={linkBtn} onClick={() => fortryd(p)}>
                Fortryd afvisning
              </button>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button className={linkBtn}>Kobl til kunde</button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-1 max-h-72 overflow-y-auto" align="end">
                {locs.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">
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
              </PopoverContent>
            </Popover>
          </span>
        )}
      </td>
    </tr>
  );

  const Gruppe = ({
    titel,
    list,
    visKundenr,
  }: {
    titel: string;
    list: PenhedDaekningRow[];
    visKundenr: boolean;
  }) => (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {titel} ({list.length})
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">–</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[11px] text-muted-foreground">
            <tr>
              <th className="text-left font-normal pr-3">Adresse</th>
              <th className="text-left font-normal pr-3">By</th>
              <th className="text-left font-normal pr-3">P-nr</th>
              <th className="text-right font-normal pr-3">Ansatte</th>
              {visKundenr && <th className="text-left font-normal pr-3">Visma-kundenr</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <Row key={p.p_number} p={p} visKundenr={visKundenr} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Gruppe titel="Dækket" list={daekket} visKundenr />
      <Gruppe titel="Ikke dækket" list={ikke} visKundenr={false} />
    </div>
  );
}
