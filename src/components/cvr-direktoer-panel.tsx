import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { koerDirektoerTrin, startDirektoerJob } from "@/lib/cvr-direktoer.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UserSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Job = { id: string; naeste: number; total: number; fundet: number; oprettet: number; status: string; beskrivelse: string | null; fejl: string | null };

/** Admin: viser og driver batch-jobs, der henter direktør fra CVR som kontaktperson. */
export function CvrDirektoerPanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const koer = useServerFn(koerDirektoerTrin);
  const start = useServerFn(startDirektoerJob);
  const aktiv = useRef<string | null>(null);

  const hent = async () => {
    const { data } = await (supabase as any)
      .from("cvr_direktoer_job")
      .select("id, naeste, fundet, oprettet, status, beskrivelse, fejl, company_ids, created_at")
      .or(`status.eq.koerer,opdateret_at.gte.${new Date(Date.now() - 3600_000).toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(5);
    setJobs(((data ?? []) as any[]).map((j) => ({ ...j, total: j.company_ids?.length ?? 0 })));
  };

  useEffect(() => {
    void hent();
    const t = setInterval(hent, 5000);
    return () => clearInterval(t);
  }, []);

  // Driv det ældste kørende job, så længe siden er åben (genoptages ved næste besøg).
  useEffect(() => {
    const j = jobs.find((x) => x.status === "koerer");
    if (!j || aktiv.current) return;
    aktiv.current = j.id;
    (async () => {
      let fejl = 0;
      for (;;) {
        try {
          const r: any = await koer({ data: { job_id: j.id } });
          setJobs((prev) => prev.map((x) => (x.id === j.id ? { ...x, ...r, total: x.total } : x)));
          if (r.status !== "koerer") break;
          fejl = 0;
        } catch (e: any) {
          if (++fejl >= 3) { toast.error("Direktør-berigelse stoppede: " + (e?.message ?? e)); break; }
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
      aktiv.current = null;
      void hent();
    })();
  }, [jobs, koer]);

  const startAlle = async () => {
    const r = await start({ data: { alle_cvr_emner: true, beskrivelse: "Alle CVR-emner" } });
    toast.success(`Henter direktør for ${r.total} CVR-emner`);
    void hent();
  };

  return (
    <Card className="p-3 mb-4 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <UserSearch className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Kontaktperson fra CVR</span>
        <span className="text-muted-foreground hidden md:inline">Direktør/indehaver hentes som "Direktør (CVR)" på nye CVR-emner.</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={startAlle} disabled={jobs.some((j) => j.status === "koerer")}>
          Hent for alle CVR-emner
        </Button>
      </div>
      {jobs.map((j) => (
        <div key={j.id} className="flex items-center gap-3 text-xs">
          {j.status === "koerer" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span className="w-40 truncate">{j.beskrivelse ?? "CVR-import"}</span>
          <Progress value={j.total ? (j.naeste / j.total) * 100 : 0} className="h-1.5 flex-1 max-w-xs" />
          <span className="tabular-nums text-muted-foreground">
            {j.naeste.toLocaleString("da-DK")} / {j.total.toLocaleString("da-DK")} · {j.fundet.toLocaleString("da-DK")} med direktør
            {j.status === "faerdig" && " · færdig"}
          </span>
          {j.fejl && <span className="text-destructive truncate">{j.fejl}</span>}
        </div>
      ))}
    </Card>
  );
}
