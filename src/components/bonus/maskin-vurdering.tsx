import { useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import { AFVIS_AARSAGER, OPGRADERING_TJEKLISTE, opsummerMaskintjek, type MaskinRaekke } from "@/lib/bonus-maskin-vurdering";

type Saelger = { user_id: string; navn: string };

/** Henter månedens maskinrækker pr. sælger (deles af vurderingskortet og låsedialogen). */
export function useMaskinTjek(maaned: string, saelgere: Saelger[], enabled: boolean) {
  const m1 = `${maaned}-01`;
  const qs = useQueries({
    queries: saelgere.map((s) => ({
      queryKey: ["afregning-maskiner", maaned, s.user_id],
      enabled,
      staleTime: 60_000,
      queryFn: async () => {
        const { data, error } = await (supabase as any).rpc("bonus_maskin_detaljer", { _saelger: s.user_id, _fra: m1, _til: m1 });
        if (error) throw error;
        return (data ?? []) as MaskinRaekke[];
      },
    })),
  });
  const loading = qs.some((q) => q.isLoading || q.isFetching);
  const pr = saelgere.map((s, i) => ({ ...s, rows: qs[i]?.data ?? [], ...opsummerMaskintjek(qs[i]?.data ?? []) }));
  return { loading, pr, loaded: enabled && qs.every((q) => q.isSuccess) };
}

type Handling = { type: "godkend" | "afvis" | "stand"; saelger: string; row: MaskinRaekke } | null;

export function MaskinVurderingKort({ maaned, saelgere, laaste, onVisSaelger }: { maaned: string; saelgere: Saelger[]; laaste: Set<string>; onVisSaelger: (id: string) => void }) {
  const qc = useQueryClient();
  const [aktiv, setAktiv] = useState(false);
  const [visAlle, setVisAlle] = useState(false);
  const { loading, pr } = useMaskinTjek(maaned, saelgere, aktiv);
  const [h, setH] = useState<Handling>(null);
  const [tjek, setTjek] = useState<Record<string, boolean>>({});
  const [aarsag, setAarsag] = useState<string>(AFVIS_AARSAGER[0]);
  const [tekst, setTekst] = useState("");
  const [stand, setStand] = useState<"ny" | "brugt">("brugt");
  const [gemmer, setGemmer] = useState(false);

  const aabn = (type: "godkend" | "afvis" | "stand", saelger: string, row: MaskinRaekke) => {
    setH({ type, saelger, row }); setTjek({}); setAarsag(AFVIS_AARSAGER[0]); setTekst(""); setStand(row.brugt ? "ny" : "brugt");
  };
  const opdater = (saelger: string) => qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] === "afregning-maskiner" && q.queryKey[2] === saelger) || String(q.queryKey[0]).startsWith("afregning-live") || q.queryKey[0] === "bonus-pr-maaned" });

  const gem = async () => {
    if (!h) return;
    const { data: eksist } = await (supabase as any).from("bonus_maskin_vurdering").select("*")
      .eq("user_id", h.saelger).eq("maaned", `${maaned}-01`).eq("serienr", h.row.serienr).maybeSingle();
    const base = { user_id: h.saelger, maaned: `${maaned}-01`, serienr: h.row.serienr, godkendt: eksist?.godkendt ?? null, ny_brugt: eksist?.ny_brugt ?? null, aarsag: eksist?.aarsag ?? null, tjekliste: eksist?.tjekliste ?? {} };
    let patch = base;
    if (h.type === "godkend") {
      if (h.row.vurdering === "opgradering" && OPGRADERING_TJEKLISTE.some((t) => !tjek[t.key])) return toast.error("Alle tre betingelser skal være opfyldt for at godkende en opgradering");
      patch = { ...base, godkendt: true, aarsag: tekst.trim() || "Godkendt ved vurdering", tjekliste: tjek };
    } else if (h.type === "afvis") {
      patch = { ...base, godkendt: false, aarsag: aarsag === "Andet" ? (tekst.trim() || "Afvist ved vurdering") : aarsag };
    } else {
      if (!tekst.trim()) return toast.error("Skriv en årsag");
      patch = { ...base, ny_brugt: stand, tjekliste: { ...(base.tjekliste ?? {}), stand_aarsag: tekst.trim() } };
    }
    setGemmer(true);
    const { error } = await (supabase as any).from("bonus_maskin_vurdering").upsert(patch, { onConflict: "user_id,maaned,serienr" });
    setGemmer(false);
    if (error) return toast.error(error.message);
    toast.success("Vurdering gemt");
    setH(null); opdater(h.saelger);
  };
  const nulstil = async (saelger: string, row: MaskinRaekke) => {
    const { error } = await (supabase as any).from("bonus_maskin_vurdering").delete()
      .eq("user_id", saelger).eq("maaned", `${maaned}-01`).eq("serienr", row.serienr);
    if (error) return toast.error(error.message);
    toast.success("Vurdering fjernet"); opdater(saelger);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h3 className="font-semibold">Maskiner til vurdering</h3>
          <p className="text-xs text-muted-foreground">Ombytninger, opgraderinger og uklassificerede maskiner tæller ikke med, før de er vurderet. Vurderinger fastfryses ved låsning.</p>
        </div>
        {!aktiv ? <Button size="sm" variant="outline" onClick={() => setAktiv(true)}>Tjek maskiner</Button> : (
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={visAlle} onCheckedChange={(v) => setVisAlle(v === true)} />Vis alle maskiner</label>
        )}
      </div>
      {aktiv && loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Henter maskiner…</div>}
      {aktiv && !loading && pr.map((s) => {
        const rows = visAlle ? s.rows : s.rows.filter((r) => r.status === "vurdering" || r.godkendt != null || r.brugt_kilde === "admin");
        const laast = laaste.has(s.user_id);
        return (
          <div key={s.user_id} className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Button variant="link" className="h-auto p-0" onClick={() => onVisSaelger(s.user_id)}>{s.navn}</Button>
              <span className="text-muted-foreground font-normal">{s.tilVurdering} til vurdering · {s.uklassificeret} uklassificeret{laast ? " · låst" : ""}</span>
            </div>
            {rows.length === 0 ? <p className="text-xs text-muted-foreground">Intet at vurdere.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1 pr-2">Serienr.</th><th className="pr-2">Model</th><th className="pr-2">Kunde</th><th className="pr-2">Ny/brugt</th><th className="pr-2">Status</th><th /></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.serienr} className="border-b last:border-0 align-top">
                    <td className="py-1.5 pr-2 font-mono text-xs">{r.serienr}</td>
                    <td className="pr-2">{r.model}</td>
                    <td className="pr-2">{r.navn}</td>
                    <td className="pr-2">{r.brugt ? "Brugt" : "Ny"}{r.brugt_kilde === "admin" && <span className="block text-xs text-muted-foreground">sat af admin</span>}</td>
                    <td className="pr-2">{r.status === "bonus" ? "Bonus" : r.status === "vurdering" ? "Afventer" : "Ingen bonus"}<span className="block text-xs text-muted-foreground">{r.aarsag}{r.forgaenger_serienr ? ` (tidligere maskine ${r.forgaenger_serienr})` : ""}</span></td>
                    <td className="whitespace-nowrap text-right space-x-1">
                      {!laast && r.bonusklasse && r.vurdering && <Button size="sm" variant="outline" onClick={() => aabn("godkend", s.user_id, r)}>Godkend</Button>}
                      {!laast && r.bonusklasse && <Button size="sm" variant="outline" onClick={() => aabn("afvis", s.user_id, r)}>Afvis</Button>}
                      {!laast && <Button size="sm" variant="ghost" onClick={() => aabn("stand", s.user_id, r)}>Ny/brugt</Button>}
                      {!laast && (r.godkendt != null || r.brugt_kilde === "admin") && <Button size="sm" variant="ghost" onClick={() => nulstil(s.user_id, r)}>Nulstil</Button>}
                      {!r.bonusklasse && <span className="text-xs text-muted-foreground">Sæt bonusklasse i Tilbudskatalog</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        );
      })}

      <Dialog open={!!h} onOpenChange={(o) => { if (!o) setH(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{h?.type === "godkend" ? "Godkend maskine" : h?.type === "afvis" ? "Afvis maskine" : "Ret ny/brugt"}</DialogTitle>
            <DialogDescription>{h?.row.model} · serienr. {h?.row.serienr} · {h?.row.navn}</DialogDescription>
          </DialogHeader>
          {h?.type === "godkend" && (
            <div className="space-y-2">
              {h.row.vurdering === "opgradering" ? <p className="text-sm">Opgradering kan kun godkendes, når alle betingelser er opfyldt:</p> : <p className="text-sm">Bekræft at placeringen ikke er en ombytning, reklamation eller teknisk ombytning.</p>}
              {OPGRADERING_TJEKLISTE.map((t) => (
                <label key={t.key} className="flex items-center gap-2 text-sm"><Checkbox checked={!!tjek[t.key]} onCheckedChange={(v) => setTjek({ ...tjek, [t.key]: v === true })} />{t.label}</label>
              ))}
              <Label>Bemærkning</Label>
              <Input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Valgfri" />
            </div>
          )}
          {h?.type === "afvis" && (
            <div className="space-y-2">
              <Label>Årsag</Label>
              <Select value={aarsag} onValueChange={setAarsag}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AFVIS_AARSAGER.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
              {aarsag === "Andet" && <Input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Beskriv årsagen" />}
            </div>
          )}
          {h?.type === "stand" && (
            <div className="space-y-2">
              <Select value={stand} onValueChange={(v) => setStand(v as "ny" | "brugt")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ny">Ny maskine</SelectItem><SelectItem value="brugt">Brugt maskine</SelectItem></SelectContent>
              </Select>
              <Label>Årsag</Label>
              <Input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Fx fakturaen mangler teksten brugt" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setH(null)}>Annullér</Button>
            <Button onClick={gem} disabled={gemmer}>{gemmer && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Gem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Advarsel i låsedialogen. */
export function LaasMaskinAdvarsel({ maaned, saelgere, aaben }: { maaned: string; saelgere: Saelger[]; aaben: boolean }) {
  const { loading, pr, loaded } = useMaskinTjek(maaned, saelgere, aaben);
  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Tjekker maskiner…</p>;
  if (!loaded) return null;
  const problemer = pr.filter((s) => s.tilVurdering + s.uklassificeret > 0);
  if (!problemer.length) return <p className="text-sm text-muted-foreground">Alle maskiner i måneden er klassificeret og vurderet.</p>;
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-destructive" />Maskiner uden afklaring tæller ikke med ved låsning</p>
      <ul className="list-disc pl-5">{problemer.map((s) => <li key={s.user_id}>{s.navn}: {s.tilVurdering} til vurdering, {s.uklassificeret} uklassificeret</li>)}</ul>
    </div>
  );
}
