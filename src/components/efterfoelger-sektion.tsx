import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, ArrowLeft, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type Link_ = { relation_id: string; retning: "efterfoelger" | "forgaenger"; company_id: string; navn: string; visma_id: string | null };

export const efterfoelgerQuery = (companyId: string) => ({
  queryKey: ["efterfoelger", companyId],
  queryFn: async () => {
    const [{ data, error }, aktiv] = await Promise.all([
      (supabase as any).rpc("efterfoelger_links", { _id: companyId }),
      (supabase as any).rpc("_har_aktiv_efterfoelger", { _id: companyId }),
    ]);
    if (error) throw error;
    return { links: (data ?? []) as Link_[], harAktivEfterfoelger: aktiv?.data === true };
  },
});

/** Viser "Fortsætter som …" / "Tidligere konto: …" og (admin) knappen "Efterfølges af…". */
export function EfterfoelgerSektion({ companyId, isAdmin }: { companyId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery(efterfoelgerQuery(companyId));
  const [open, setOpen] = useState(false);
  const links = q.data?.links ?? [];
  const efter = links.filter((l) => l.retning === "efterfoelger");
  const foer = links.filter((l) => l.retning === "forgaenger");

  const fjern = async (id: string) => {
    if (!confirm("Fjern koblingen mellem de to konti?")) return;
    const { error } = await (supabase as any).rpc("efterfoelger_fjern", { _relation_id: id });
    if (error) return toast.error(error.message);
    toast.success("Koblingen er fjernet");
    qc.invalidateQueries();
  };

  if (!links.length && !isAdmin) return null;
  return (
    <>
      {links.length > 0 && (
        <Card className="mb-4 p-3 bg-accent/40 border-accent space-y-1" data-testid="efterfoelger-links">
          {efter.map((l) => (
            <p key={l.relation_id} className="text-sm flex items-center gap-2 flex-wrap">
              <ArrowRight className="h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">Fortsætter som</span>
              <Link to="/virksomheder/$id" params={{ id: l.company_id }} className="font-medium hover:underline">{l.navn}</Link>
              {l.visma_id && <span className="text-muted-foreground">· {l.visma_id}</span>}
              {isAdmin && <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => fjern(l.relation_id)}><X className="h-3.5 w-3.5 mr-1" />Fjern</Button>}
            </p>
          ))}
          {foer.map((l) => (
            <p key={l.relation_id} className="text-sm flex items-center gap-2 flex-wrap">
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">Tidligere konto:</span>
              <Link to="/virksomheder/$id" params={{ id: l.company_id }} className="font-medium hover:underline">{l.navn}</Link>
              {l.visma_id && <span className="text-muted-foreground">· {l.visma_id}</span>}
              <span className="text-xs text-muted-foreground">(historik og købsrytme vises samlet)</span>
              {isAdmin && <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => fjern(l.relation_id)}><X className="h-3.5 w-3.5 mr-1" />Fjern</Button>}
            </p>
          ))}
        </Card>
      )}
      {isAdmin && efter.length === 0 && (
        <div className="mb-4">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Efterfølges af…</Button>
        </div>
      )}
      {isAdmin && <VaelgDialog open={open} onOpenChange={setOpen} companyId={companyId} onDone={() => qc.invalidateQueries()} />}
    </>
  );
}

function VaelgDialog({ open, onOpenChange, companyId, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; companyId: string; onDone: () => void }) {
  const [soeg, setSoeg] = useState("");
  const [gemmer, setGemmer] = useState<string | null>(null);
  const k = useQuery({
    queryKey: ["efterfoelger-kandidater", companyId, soeg],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("efterfoelger_kandidater", { _id: companyId, _soeg: soeg || null });
      if (error) throw error;
      return (data ?? []) as { company_id: string; navn: string; visma_id: string | null; by: string | null; samme_cvr: boolean }[];
    },
  });
  const vaelg = async (til: string) => {
    setGemmer(til);
    const { error } = await (supabase as any).rpc("efterfoelger_saet", { _fra: companyId, _til: til });
    setGemmer(null);
    if (error) return toast.error(error.message);
    toast.success("Kontoen er koblet til sin efterfølger");
    onOpenChange(false);
    onDone();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Efterfølges af…</DialogTitle>
          <DialogDescription>Vælg den nye konto, kunden fortsætter på. Hver konto beholder sine egne tal.</DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Søg på navn eller Visma-nr. (tom = samme CVR)" value={soeg} onChange={(e) => setSoeg(e.target.value)} />
        <div className="max-h-80 overflow-y-auto divide-y border rounded-md">
          {k.isLoading && <p className="p-3 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />Henter…</p>}
          {!k.isLoading && !(k.data ?? []).length && <p className="p-3 text-sm text-muted-foreground">Ingen konti fundet.</p>}
          {(k.data ?? []).map((c) => (
            <button key={c.company_id} type="button" disabled={!!gemmer} onClick={() => vaelg(c.company_id)}
              className="w-full text-left p-2 hover:bg-muted flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="font-medium">{c.navn}</span>
                <span className="text-xs text-muted-foreground"> · {c.visma_id ?? "—"}{c.by ? ` · ${c.by}` : ""}</span>
              </span>
              {c.samme_cvr && <span className="text-xs rounded bg-secondary px-1.5 py-0.5 shrink-0">Samme CVR</span>}
              {gemmer === c.company_id && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
