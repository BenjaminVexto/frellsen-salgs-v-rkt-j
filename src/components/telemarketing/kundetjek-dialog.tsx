import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Search, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { kundetjekSoeg, kundetjekTilfoej } from "@/lib/kundetjek.functions";
import { KUNDETJEK_TEKST, kanTilfoejes, type KundetjekHit } from "@/lib/kundetjek";
import { AGENT_CODES, erAgentCode, gemAgent, hentAgent, type AgentCode } from "@/lib/agent-code";

export function KundetjekDialog({ listId, open, onOpenChange, onAdded }: {
  listId: string; open: boolean; onOpenChange: (v: boolean) => void; onAdded: (navn: string) => void;
}) {
  const soeg = useServerFn(kundetjekSoeg);
  const tilfoej = useServerFn(kundetjekTilfoej);
  const [fane, setFane] = useState<"navn" | "cvr">("navn");
  const [navn, setNavn] = useState("");
  const [sted, setSted] = useState("");
  const [cvr, setCvr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<KundetjekHit[] | null>(null);
  const [agent, setAgent] = useState<AgentCode | null>(() => (typeof window === "undefined" ? null : hentAgent()));
  const [tilfoejer, setTilfoejer] = useState<string | null>(null);
  const [tilfoejede, setTilfoejede] = useState<Set<string>>(new Set());

  const koer = async () => {
    const input = fane === "cvr"
      ? { list_id: listId, cvr: cvr.replace(/\D/g, ""), agent_code: agent }
      : { list_id: listId, name: navn.trim(), location: sted.trim() || undefined, agent_code: agent };
    if (fane === "cvr" && !/^\d{8}$/.test(input.cvr ?? "")) { toast.error("CVR skal være 8 cifre"); return; }
    if (fane === "navn" && (input.name ?? "").length < 2) { toast.error("Skriv mindst 2 tegn af navnet"); return; }
    setBusy(true);
    try {
      const r = await soeg({ data: input });
      setHits(r.hits);
      if (r.fejl) toast.info(r.fejl);
    } catch (e: any) { toast.error(e?.message ?? "Kundetjek fejlede"); }
    finally { setBusy(false); }
  };

  const add = async (h: KundetjekHit) => {
    if (!erAgentCode(agent)) { toast.error("Vælg agentkode"); return; }
    const key = `${h.cvr}:${h.p_number ?? ""}`;
    setTilfoejer(key);
    try {
      const r = await tilfoej({ data: { list_id: listId, cvr: h.cvr, p_number: h.p_number, agent_code: agent } });
      gemAgent(agent);
      setTilfoejede(s => new Set(s).add(key));
      toast.success(`${r.navn} er tilføjet til ringelisten`);
      onAdded(r.navn);
    } catch (e: any) { toast.error(e?.message ?? "Kunne ikke tilføje"); }
    finally { setTilfoejer(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Kundetjek</DialogTitle></DialogHeader>
        <Tabs value={fane} onValueChange={(v) => setFane(v as "navn" | "cvr")}>
          <TabsList>
            <TabsTrigger value="navn">Søg på navn</TabsTrigger>
            <TabsTrigger value="cvr">CVR-nummer</TabsTrigger>
          </TabsList>
          <form onSubmit={(e) => { e.preventDefault(); void koer(); }}>
            <TabsContent value="navn" className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[200px]"><Label className="text-xs">Navn</Label><Input value={navn} onChange={(e) => setNavn(e.target.value)} autoFocus /></div>
              <div className="w-40"><Label className="text-xs">By eller postnr.</Label><Input value={sted} onChange={(e) => setSted(e.target.value)} /></div>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}Tjek</Button>
            </TabsContent>
            <TabsContent value="cvr" className="flex items-end gap-2">
              <div className="w-48"><Label className="text-xs">CVR-nummer</Label><Input value={cvr} onChange={(e) => setCvr(e.target.value)} inputMode="numeric" /></div>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}Tjek</Button>
            </TabsContent>
          </form>
        </Tabs>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Agent</span>
          <Select value={agent ?? ""} onValueChange={(v) => erAgentCode(v) && setAgent(v)}>
            <SelectTrigger className="w-20 h-8"><SelectValue placeholder="–" /></SelectTrigger>
            <SelectContent>{AGENT_CODES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {hits && (
          <div className="divide-y border rounded-md">
            {hits.length === 0 && <div className="p-4 text-sm text-muted-foreground">Ingen resultater.</div>}
            {hits.map((h) => {
              const key = `${h.cvr}:${h.p_number ?? ""}`;
              const kan = kanTilfoejes(h);
              const tilf = tilfoejede.has(key);
              return (
                <div key={key} className="p-3 space-y-1" data-testid="kundetjek-hit">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{h.navn ?? "–"}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">CVR {h.cvr}{h.p_number ? ` · P ${h.p_number}` : ""}</span>
                    {h.reklamebeskyttet && <Badge variant="destructive">Reklamebeskyttet</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {[h.adresse, [h.postnr, h.by].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                    {h.branche ? ` · ${h.branche}` : ""}{h.ansatte ? ` · ${h.ansatte.replace("_", "–")} ansatte` : ""}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-medium ${h.status === "ikke_kunde" && !h.reklamebeskyttet ? "text-primary" : "text-destructive"}`} data-status={h.status}>
                      {h.reklamebeskyttet && h.status === "ikke_kunde" ? "Reklamebeskyttet – må ikke ringes op" : KUNDETJEK_TEKST[h.status](h)}
                    </span>
                    {kan && (
                        <Button size="sm" className="h-7 ml-auto" disabled={tilf || tilfoejer === key} onClick={() => void add(h)}>
                          {tilfoejer === key && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          {tilf ? "Tilføjet" : "Tilføj til ringelisten"}
                        </Button>
                    )}
                  </div>
                  {kan && h.uden_for_distrikt && (
                    <div className="flex items-center gap-1 text-xs rounded bg-warning/30 text-warning-foreground px-2 py-1 w-fit">
                      <AlertTriangle className="h-3 w-3" /> Postnummeret ligger uden for listens sælgers distrikt
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
