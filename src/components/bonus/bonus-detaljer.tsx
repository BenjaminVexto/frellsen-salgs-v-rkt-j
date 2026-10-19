import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hentAlle } from "@/lib/hent-alle";
import { afstandTilTop, type BonusPlacering } from "@/lib/bonus-rangliste";
import { filtrerBonusMaskiner, MASKIN_LABEL, type MaskinFilter } from "@/lib/bonus-maskin-visning";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trophy } from "lucide-react";

export type BonusDrill = { maaned: string; visning: "db" | "maskiner" | "rangliste"; filter: MaskinFilter; bonus: number };
const tal = (n: number) => Number(n).toLocaleString("da-DK", { maximumFractionDigits: 0 });
const dato = (s: string) => s ? new Date(s).toLocaleDateString("da-DK") : "—";
const maanedNavn = (s: string) => new Date(`${s}-01`).toLocaleDateString("da-DK", { month: "short", year: "numeric" }).replace(".", "");
type Kol = { key: string; label: string; num?: boolean; cell: (r: any) => React.ReactNode; val?: (r: any) => string | number };
function DetailRows({ rows, cols }: { rows: any[]; cols: Kol[] }) {
  const [sort, setSort] = useState<{ key: string; dir: number } | null>(null);
  const col = cols.find((c) => c.key === sort?.key);
  const sorted = col && sort ? [...rows].sort((a, b) => {
    const av = col.val?.(a) ?? a[col.key] ?? ""; const bv = col.val?.(b) ?? b[col.key] ?? "";
    return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "da")) * sort.dir;
  }) : rows;
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">Ingen linjer i denne måned.</p>;
  return <>
    <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm tabular-nums"><thead><tr className="border-b">{cols.map((c) => <th key={c.key} className={`py-2 px-2 font-medium ${c.num ? "text-right" : "text-left"}`}><Button variant="ghost" className="h-auto p-0 font-medium hover:underline" onClick={() => setSort({ key: c.key, dir: sort?.key === c.key ? -sort.dir : 1 })}>{c.label}{sort?.key === c.key ? sort.dir === 1 ? " ↑" : " ↓" : ""}</Button></th>)}</tr></thead><tbody>{sorted.map((r, i) => <tr key={i} className="border-b last:border-0">{cols.map((c) => <td key={c.key} className={`py-3 px-2 ${c.num ? "text-right" : "text-left"}`}>{c.cell(r)}</td>)}</tr>)}</tbody></table></div>
    <div className="md:hidden divide-y">{sorted.map((r, i) => <article key={i} className="py-4 space-y-2"><div className="font-medium break-words">{cols[0]?.cell(r)}</div><dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{cols.slice(1).map((c) => <div key={c.key} className="min-w-0"><dt className="text-xs text-muted-foreground">{c.label}</dt><dd className="break-words tabular-nums">{c.cell(r)}</dd></div>)}</dl></article>)}</div>
  </>;
}
export function BonusDetaljer({ drill, saelgerId, onClose }: { drill: BonusDrill | null; saelgerId: string; onClose: () => void }) {
  const [filter, setFilter] = useState<MaskinFilter>(drill?.filter ?? "alle");
  const q = useQuery({
    queryKey: ["bonus-separated-details", saelgerId, drill?.maaned, drill?.visning], enabled: !!drill,
    queryFn: async () => {
      if (!drill) return [];
      if (drill.visning === "rangliste") {
        const { data, error } = await supabase.rpc("bonus_nykunde_rangliste", { _maaned: `${drill.maaned}-01` });
        if (error) throw error;
        return (data ?? []).map((r) => ({ ...r, db: Number(r.db), rang: Number(r.rang), beloeb: Number(r.beloeb) }));
      }
      const rpc = drill.visning === "db" ? "bonus_db_detaljer" : "bonus_maskin_detaljer";
      return hentAlle<any>(() => (supabase as any).rpc(rpc, { _saelger: saelgerId, _fra: `${drill.maaned}-01`, _til: `${drill.maaned}-01` }));
    },
  });
  const rows = q.data ?? [];
  const machines = filtrerBonusMaskiner(rows, filter);
  const own = (rows as BonusPlacering[]).find((r) => r.saelger === saelgerId);
  const gaps = afstandTilTop(rows as BonusPlacering[], saelgerId);
  const navn = (r: any) => <Link to="/virksomheder/$id" params={{ id: r.company_id }} className="text-primary hover:underline">{r.navn}</Link>;
  const dbCols: Kol[] = [
    { key: "navn", label: "Virksomhed", cell: navn }, { key: "by", label: "By", cell: (r) => r.by || "—" },
    { key: "kategori", label: "Kundetype", cell: (r) => r.kategori === "offentlig" ? "Udbudskunder" : "Forhandlingskunder" },
    { key: "db", label: "DB", num: true, val: (r) => Number(r.db), cell: (r) => `${tal(r.db)} kr.` },
    { key: "omsaetning", label: "Omsætning", num: true, val: (r) => Number(r.omsaetning), cell: (r) => `${tal(r.omsaetning)} kr.` },
  ];
  const maskCols: Kol[] = [
    { key: "navn", label: "Virksomhed", cell: navn }, { key: "by", label: "By", cell: (r) => r.by || "—" },
    { key: "model", label: "Model", cell: (r) => r.model || "—" }, { key: "serienr", label: "Serienr.", cell: (r) => <span className="font-mono text-xs">{r.serienr || "—"}</span> },
    { key: "maerke", label: "Mærke", cell: (r) => r.maerke || "—" },
    { key: "bonusklasse", label: "Bonusklasse", cell: (r) => MASKIN_LABEL[r.bonusklasse as MaskinFilter] || r.bonusklasse || "—" },
    { key: "kilde", label: "Type", cell: (r) => r.kilde === "leje" ? "Leje/udlån" : "Salg" },
    { key: "brugt", label: "Stand", cell: (r) => r.brugt ? "Brugt" : "Ny" },
    { key: "antal", label: "Antal", num: true, val: (r) => Number(r.antal), cell: (r) => tal(r.antal) },
    { key: "faktura_dato", label: "Fakturadato", cell: (r) => dato(r.faktura_dato) },
    { key: "beloeb", label: "Beløb", num: true, val: (r) => Number(r.beloeb), cell: (r) => `${tal(r.beloeb)} kr.` },
    { key: "udeladt", label: "Tæller med", cell: (r) => r.udeladt ? `Nej — ${r.aarsag || "udeladt"}` : "Ja" },
  ];
  const title = drill?.visning === "db" ? "DB-bonus" : drill?.visning === "rangliste" ? "Nye kunder · månedens rangliste" : filter === "alle" ? "Maskinbonus" : MASKIN_LABEL[filter];
  return <Dialog open={!!drill} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="w-[calc(100%-1.5rem)] max-w-6xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6"><DialogHeader className="text-left pr-6"><DialogTitle>{title} — {drill ? maanedNavn(drill.maaned) : ""}</DialogTitle><DialogDescription>{drill?.visning === "rangliste" ? "DB på nye kunder · afdeling 11" : `Optjent ${drill?.visning === "db" ? "DB-bonus" : "maskinbonus"}: ${tal(drill?.bonus ?? 0)} kr.`}</DialogDescription></DialogHeader>
    {q.isLoading ? <div className="flex gap-2 items-center text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />Henter…</div> : q.error ? <p className="text-destructive">{q.error.message}</p> : <div className="min-w-0 space-y-4">
      {drill?.visning === "db" && <><p className="text-sm text-muted-foreground">{new Set(rows.map((r) => r.company_id)).size} virksomheder · DB-grundlag {tal(rows.reduce((sum, r) => sum + Number(r.db), 0))} kr.</p><DetailRows rows={rows} cols={dbCols} /></>}
      {drill?.visning === "maskiner" && <><div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"><Select value={filter} onValueChange={(v) => { if (v === "alle" || v === "wittenborg" || v === "animo" || v === "rex") setFilter(v); }}><SelectTrigger className="w-48" aria-label="Maskintype"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(MASKIN_LABEL) as MaskinFilter[]).map((k) => <SelectItem key={k} value={k}>{MASKIN_LABEL[k]}</SelectItem>)}</SelectContent></Select><p className="text-sm text-muted-foreground">{tal(machines.filter((r) => !r.udeladt).reduce((sum, r) => sum + Number(r.antal), 0))} maskiner · {new Set(machines.filter((r) => !r.udeladt).map((r) => r.company_id)).size} kunder</p></div><DetailRows rows={machines} cols={maskCols} /></>}
      {drill?.visning === "rangliste" && <>
        {own && <div className="bg-muted rounded-md p-4 space-y-1"><p className="font-medium">{own.navn} · plads {own.rang} · {tal(own.db)} kr. i DB</p><div className="text-sm text-muted-foreground space-y-1">{gaps.map((g) => <p key={g.rang}>{tal(g.afstand)} kr. i DB op til {g.rang}. plads</p>)}{own.rang === 1 && <p className="flex items-center gap-2"><Trophy className="h-4 w-4 shrink-0" />Månedens vinder</p>}</div></div>}
        {rows.length === 0 ? <p className="text-muted-foreground text-sm">Ingen bonusberettigede sælgere med positivt DB på nye kunder i denne måned.</p> : <div className="divide-y">{(rows as BonusPlacering[]).map((r) => <div key={r.saelger} className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 items-center py-4 px-2 ${r.saelger === saelgerId ? "bg-accent rounded-md" : ""}`}><span className="font-semibold tabular-nums">{r.rang === 1 ? <Trophy aria-label="Førsteplads" className="h-5 w-5 text-primary" /> : r.rang}</span><div className="min-w-0"><p className="font-medium break-words">{r.navn}</p><p className="text-xs text-muted-foreground">{r.beloeb ? `${tal(r.beloeb)} kr. i nykunde-bonus` : "Ingen nykunde-bonus"}</p></div><span className="font-semibold text-sm tabular-nums whitespace-nowrap">{tal(r.db)} kr.</span></div>)}</div>}
      </>}
    </div>}
  </DialogContent></Dialog>;
}
