import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Phone } from "lucide-react";
import { toast } from "sonner";
import { RingerVaelger, useTmBrugere } from "./ringer-vaelger";
import { AARSAGER, SUCCES, UDFALD_LABEL, udfaldStatistik, type Udfald } from "@/lib/telemarketing";

type Opk = { id: string; created_at: string; user_id: string; rolle: string | null; company_id: string; udfald: Udfald; aarsag: string | null; note: string | null; moede_at: string | null; moede_saelger_user_id: string | null };

const sb = supabase as any;
const ROLLE: Record<string, string> = { telemarketing: "Bureau", saelger: "Sælger", admin: "Admin" };

/** Admin: bureau-opsætning og opkaldsoverblik på en kontaktliste. */
export function BureauPanel({ listId, refreshKey = 0 }: { listId: string; refreshKey?: number }) {
  const tm = useTmBrugere();
  const [ringere, setRingere] = useState<string[]>([]);
  const [modtager, setModtager] = useState<"distrikt" | "fast">("distrikt");
  const [saelger, setSaelger] = useState<string>("");
  const [saelgere, setSaelgere] = useState<{ id: string; full_name: string }[]>([]);
  const [opkald, setOpkald] = useState<Opk[]>([]);
  const [firmaNavn, setFirmaNavn] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: l }, { data: roles }, { data: o }] = await Promise.all([
        sb.from("kontaktliste_ringer").select("user_id").eq("contact_list_id", listId),
        sb.from("contact_lists").select("moede_modtager, moede_saelger_user_id").eq("id", listId).single(),
        sb.from("user_roles").select("user_id").in("role", ["saelger", "admin"]),
        sb.from("kontaktliste_opkald").select("*").eq("contact_list_id", listId).order("created_at"),
      ]);
      setRingere((r ?? []).map((x: any) => x.user_id));
      setModtager(l?.moede_modtager === "fast" ? "fast" : "distrikt");
      setSaelger(l?.moede_saelger_user_id ?? "");
      const ids = [...new Set((roles ?? []).map((x: any) => x.user_id))];
      if (ids.length) {
        const { data: p } = await sb.from("profiles").select("id, full_name, is_active").in("id", ids).order("full_name");
        setSaelgere((p ?? []).filter((x: any) => x.is_active !== false));
      }
      setOpkald(o ?? []);
      const cids = [...new Set((o ?? []).map((x: Opk) => x.company_id))] as string[];
      if (cids.length) {
        const { data: c } = await sb.from("companies").select("id, name").in("id", cids);
        setFirmaNavn(Object.fromEntries((c ?? []).map((x: any) => [x.id, x.name])));
      }
    })();
  }, [listId, refreshKey]);

  const gemRingere = async (v: string[]) => {
    const fjern = ringere.filter((x) => !v.includes(x));
    const tilfoej = v.filter((x) => !ringere.includes(x));
    setRingere(v);
    if (fjern.length) await sb.from("kontaktliste_ringer").delete().eq("contact_list_id", listId).in("user_id", fjern);
    if (tilfoej.length) await sb.from("kontaktliste_ringer").insert(tilfoej.map((user_id) => ({ contact_list_id: listId, user_id })));
    toast.success("Ringes af opdateret");
  };
  const gemModtager = async (m: "distrikt" | "fast", s: string) => {
    setModtager(m); setSaelger(s);
    const { error } = await sb.from("contact_lists").update({ moede_modtager: m, moede_saelger_user_id: s || null }).eq("id", listId);
    if (error) toast.error(error.message); else toast.success("Møder går til opdateret");
  };

  const navn = (id: string | null) =>
    (id && (tm.find((t) => t.user_id === id)?.navn || saelgere.find((s) => s.id === id)?.full_name)) || "—";

  const stat = useMemo(() => {
    const base = udfaldStatistik(opkald);
    const aarsag: Record<string, number> = {};
    opkald.filter((o) => o.udfald === "ikke_interesseret").forEach((o) => { aarsag[o.aarsag ?? "andet"] = (aarsag[o.aarsag ?? "andet"] ?? 0) + 1; });
    const pr: Record<string, { opkald: number; succes: number; rolle: string | null }> = {};
    const dag: Record<string, { opkald: number; succes: number }> = {};
    for (const o of opkald) {
      const d = o.created_at.slice(0, 10);
      (pr[o.user_id] ??= { opkald: 0, succes: 0, rolle: o.rolle }).opkald++;
      (dag[d] ??= { opkald: 0, succes: 0 }).opkald++;
      if (SUCCES.includes(o.udfald)) { pr[o.user_id].succes++; dag[d].succes++; }
    }
    return { ...base, aarsag, pr, dag };
  }, [opkald]);

  const csv = () => {
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [["Tidspunkt", "Virksomhed", "Bruger", "Rolle", "Udfald", "Årsag", "Note", "Møde", "Møde hos"].join(";")];
    for (const o of opkald) {
      lines.push([new Date(o.created_at).toLocaleString("da-DK"), firmaNavn[o.company_id] ?? o.company_id, navn(o.user_id), ROLLE[o.rolle ?? ""] ?? "",
        UDFALD_LABEL[o.udfald], AARSAGER.find((a) => a.v === o.aarsag)?.l ?? o.aarsag ?? "", o.note ?? "",
        o.moede_at ? new Date(o.moede_at).toLocaleString("da-DK") : "", o.moede_saelger_user_id ? navn(o.moede_saelger_user_id) : ""].map(esc).join(";"));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "opkald.csv"; a.click();
  };

  return (
    <Card className="p-4 mb-4 space-y-4">
      <div className="flex items-center gap-2"><Phone className="h-4 w-4" /><h2 className="font-semibold">Telemarketing</h2></div>
      <div className="grid gap-4 md:grid-cols-2">
        <RingerVaelger value={ringere} onChange={gemRingere} />
        <div className="space-y-2">
          <Label>Møder går til</Label>
          <Select value={modtager} onValueChange={(v) => gemModtager(v as any, saelger)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="distrikt">Distriktssælger ud fra postnummer</SelectItem>
              <SelectItem value="fast">Fast sælger</SelectItem>
            </SelectContent>
          </Select>
          <Select value={saelger || "none"} onValueChange={(v) => gemModtager(modtager, v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Vælg sælger" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{modtager === "fast" ? "Vælg sælger" : "Ingen reservesælger"}</SelectItem>
              {saelgere.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {modtager === "fast" ? "Alle møder går til den valgte sælger." : "Bruges når postnummeret ikke ligger i et distrikt med sælger."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
        {[["Virksomheder ringet", stat.ringet], ["Registreringer i alt", stat.opkald], ["Opnået", stat.opnaaet], ["Møder booket", stat.moeder], ["Tilbud ønsket", stat.tilbud],
          ["Succes", `${stat.succes} (${Math.round(stat.succesrate * 100)} % af opnået)`]].map(([l, v]) => (
          <div key={l as string} className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{l}</div><div className="text-lg font-semibold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3 text-sm">
        <div><div className="font-medium mb-1">Ikke interesseret – årsager</div>
          {AARSAGER.map((a) => <div key={a.v} className="flex justify-between"><span>{a.l}</span><span className="tabular-nums">{stat.aarsag[a.v] ?? 0}</span></div>)}</div>
        <div><div className="font-medium mb-1">Pr. bruger</div>
          {Object.entries(stat.pr).map(([u, x]) => <div key={u} className="flex justify-between gap-2"><span>{navn(u)} <span className="text-xs text-muted-foreground">({ROLLE[x.rolle ?? ""] ?? "?"})</span></span><span className="tabular-nums">{x.opkald} registreringer · {x.succes} succes</span></div>)}
          {!Object.keys(stat.pr).length && <span className="text-muted-foreground">Ingen opkald endnu</span>}</div>
        <div><div className="font-medium mb-1">Pr. dag</div>
          {Object.entries(stat.dag).sort((a, b) => b[0].localeCompare(a[0])).map(([d, x]) => <div key={d} className="flex justify-between"><span>{new Date(d).toLocaleDateString("da-DK")}</span><span className="tabular-nums">{x.opkald} registreringer · {x.succes} succes</span></div>)}</div>
      </div>
      <Button size="sm" variant="outline" onClick={csv} disabled={!opkald.length}><Download className="h-4 w-4 mr-2" />Eksportér registreringer (CSV)</Button>
    </Card>
  );
}
