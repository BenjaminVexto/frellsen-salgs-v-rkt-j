import { logImport } from "@/lib/import-log";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, FileUp, Loader2, CheckCircle2, Receipt, AlertTriangle, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enqueueInvoiceImport, resolveDeliveryNos } from "@/lib/invoice-import.functions";
import { parseInvoiceJournal, AFVIGENDE_MAANEDER, type InvoiceLineRaw, type ParseStats } from "@/lib/invoice-parse";
import { ImportKolonneTjekliste } from "@/components/import-kolonne-tjekliste";
import { IMPORT_KONTRAKTER } from "@/lib/import-kontrakter";

export const Route = createFileRoute("/_authenticated/admin/import/faktura")({
  component: FakturaImportSide,
});

type JobRow = {
  id: string;
  status: string;
  phase: string;
  total_lines: number | null;
  saved_lines: number | null;
  lines_deleted: number | null;
  months_rebuilt: number | null;
  lines_date_from: string | null;
  lines_date_to: string | null;
  locations_matched: number;
  unmatched_delivery_nos: string[] | null;
  last_error: string | null;
  attempts: number;
};

const PHASE_LABEL: Record<string, string> = {
  lines: "Skriver fakturalinjer…",
  prune: "Rydder gamle fakturalinjer…",
  aggregate: "Genberegner salgsdata…",
  relink: "Kobler salgsrækker til kunder…",
  done: "Færdig",
};

// Rå fakturalinjer: 5.000 pr. chunk (SKAL matche workeren).
const LINES_CHUNK_SIZE = 5_000;

const BUCKET = "invoice-uploads";



function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function FakturaImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const enqueueFn = useServerFn(enqueueInvoiceImport);
  const resolveFn = useServerFn(resolveDeliveryNos);

  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [stageProgress, setStageProgress] = useState<{ done: number; total: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rowsByAfdeling, setRowsByAfdeling] = useState<Record<string, number> | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const pollRef = useRef<number | null>(null);
  const [parsed, setParsed] = useState<{ rawLines: InvoiceLineRaw[]; stats: ParseStats } | null>(null);
  const [analyseFejl, setAnalyseFejl] = useState<string | null>(null);
  const [bekraeftAfvigende, setBekraeftAfvigende] = useState(false);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    async function tick() {
      const { data, error } = await supabase
        .from("invoice_import_jobs")
        .select(
          "id,status,phase,total_lines,saved_lines,lines_deleted,months_rebuilt,lines_date_from,lines_date_to,locations_matched,unmatched_delivery_nos,last_error,attempts",
        )
        .eq("id", jobId!)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setJob(data as JobRow);
      if (data.status === "completed" || data.status === "failed") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    tick();
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [jobId]);

  async function handleAnalyse() {
    if (!file) return;
    setWorking(true);
    setParsed(null);
    setAnalyseFejl(null);
    setBekraeftAfvigende(false);
    try {
      setStage("Henter afdelinger…");
      const [{ data: afdRows, error: afdErr }, { data: aliasRows, error: aliasErr }] = await Promise.all([
        supabase.from("afdeling").select("afdeling_nr, firma_nr").eq("aktiv", true),
        supabase.from("afdeling_alias").select("kilde_afdeling_nr, afdeling_nr"),
      ]);
      if (afdErr) throw new Error("Kunne ikke hente afdelinger: " + afdErr.message);
      if (aliasErr) throw new Error("Kunne ikke hente afdelings-alias: " + aliasErr.message);
      const afdelinger = (afdRows ?? []) as Array<{ afdeling_nr: number; firma_nr: number | null }>;
      const afdelingAliases = (aliasRows ?? []) as Array<{ kilde_afdeling_nr: number; afdeling_nr: number }>;
      if (!afdelinger.length) throw new Error("Ingen aktive afdelinger fundet");
      if (!afdelingAliases.length) throw new Error("Ingen rækker i afdeling_alias — kan ikke mappe kildeafdelinger");
      setStage("Læser fakturajournal…");
      const res = await parseInvoiceJournal(file, { afdelinger, afdelingAliases });
      if (!res.rawLines.length) throw new Error("Filen indeholder ingen fakturalinjer.");
      setParsed(res);
    } catch (e: any) {
      setAnalyseFejl(e?.message ?? "Ukendt fejl");
      void logImport("faktura", "fejl", file?.name, e?.message ?? "Ukendt fejl");
    } finally {
      setStage("");
      setWorking(false);
    }
  }

  async function handleSubmit() {
    if (!file || !parsed) return;
    setWorking(true);
    setJob(null);
    setJobId(null);
    try {
      const { rawLines, stats } = parsed;
      setRowsByAfdeling(stats.rowsByAfdeling);
      toast.message(
        `Parset: ${stats.linesRead.toLocaleString("da-DK")} fakturalinjer · ${stats.uniqueDeliveryNos.toLocaleString("da-DK")} leveringsnumre`,
      );

      // 2) Slå leveringsnumre op — kun til visning af hvor mange der er kendt.
      //    Selve koblingen til lokation sker i databasens genberegning.
      setStage("Slår leveringsnumre op…");
      const pairMap = new Map<string, { afdeling_nr: number; visma_delivery_no: string }>();
      for (const r of rawLines) {
        pairMap.set(`${r.afdeling_nr}|${r.visma_delivery_no}`, {
          afdeling_nr: r.afdeling_nr,
          visma_delivery_no: r.visma_delivery_no,
        });
      }
      const pairs = Array.from(pairMap.values());
      const { map } = await resolveFn({ data: { pairs } });
      const matched = Object.keys(map).length;
      const unmatched = Array.from(pairMap.keys()).filter((k) => !map[k]);

      // 3) Chunk + upload rålinjer til private storage
      const newJobId = crypto.randomUUID();
      const linesBatchId = crypto.randomUUID();
      const lineChunks = chunked(rawLines, LINES_CHUNK_SIZE);
      const totalUploads = lineChunks.length;
      let uploadIdx = 0;

      setStage("Uploader fakturalinjer til server…");
      setStageProgress({ done: 0, total: totalUploads });

      async function uploadChunk(idx: number, rows: unknown[]) {
        const path = `${newJobId}/lines-${idx}.json`;
        const body = new Blob([JSON.stringify(rows)], { type: "application/json" });
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, body, { upsert: true, contentType: "application/json" });
        if (error) throw new Error(`Upload af ${path} fejlede: ${error.message}`);
        uploadIdx++;
        setStageProgress({ done: uploadIdx, total: totalUploads });
      }

      for (let i = 0; i < lineChunks.length; i++) await uploadChunk(i, lineChunks[i]);

      // 4) Enqueue jobbet — workeren skriver linjer, rydder, genberegner og kobler
      setStage("Tilmelder job til server-worker…");
      setStageProgress(null);
      await enqueueFn({
        data: {
          jobId: newJobId,
          locationsMatched: matched,
          unmatched,
          rowsByAfdeling: stats.rowsByAfdeling,
          totalLines: rawLines.length,
          linesBatchId,
          dateFrom: stats.dateFrom,
          dateTo: stats.dateTo,
          afdelinger: Object.keys(stats.rowsByAfdeling).map((k) => Number(k)),
          filename: file?.name ?? null,
          dbSummeringer: stats.dbAfstemning.summeringer,
          dbRapport: {
            antal: stats.dbAfstemning.antal,
            udledtBeloeb: stats.dbAfstemning.udledtBeloeb,
            udledtPrVaregruppe: stats.dbAfstemning.udledtPrVaregruppe,
            db0KorrektPrVaregruppe: stats.dbAfstemning.db0KorrektPrVaregruppe,
            afvigelser: stats.dbAfstemning.afvigelser.length,
            totallinjeDb: stats.dbAfstemning.totallinjeDb,
            linjeDbFoer: stats.dbAfstemning.linjeDbFoer,
            linjeDbEfter: stats.dbAfstemning.linjeDbEfter,
          },
          berorteMaaneder: stats.maaneder.map(({ afdeling_nr, maaned, fra, til, linjer }) => ({
            afdeling_nr, maaned, fra, til, linjer,
          })),
        },
      });

      setJobId(newJobId);
      setParsed(null);
      setStage("");
      toast.success(
        "Klar — serveren skriver linjerne og genberegner salgsdata i baggrunden. Du kan lukke fanen.",
      );

    } catch (e: any) {
      toast.error(e?.message ?? "Ukendt fejl");
      void logImport("faktura", "fejl", file?.name, e?.message ?? "Ukendt fejl");
      setStage("");
    } finally {
      setWorking(false);
    }
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const running = job && (job.status === "queued" || job.status === "running");
  const afvigende = parsed?.stats.maaneder.filter((m) => m.afvigende) ?? [];
  const stagePct = stageProgress && stageProgress.total > 0
    ? Math.round((stageProgress.done / stageProgress.total) * 100)
    : null;


  return (
    <div className="px-4 md:px-8 py-8 max-w-4xl mx-auto pb-24 md:pb-8 space-y-6">
      <div>
        <Link to="/admin/import" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-2 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Tilbage
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
          <Receipt className="h-6 w-6" /> Faktura Journal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vælg filen og tryk "Analysér fil" — du ser antal linjer pr. måned pr. afdeling, før noget
          ændres. Importen rydder og genberegner kun de måneder pr. afdeling, som filen indeholder, og
          inden for hver måned kun fra filens første til sidste dato. Andre måneder røres aldrig.
          Filen skal have 17 kolonner uden overskrifter; det gamle format med 20 kolonner accepteres
          midlertidigt (Kundenavn og Kundeprisgruppe 1/2 ignoreres — de hentes fra Aktør). Kør Aktør først.
        </p>

      </div>

      <Card className="p-6 space-y-4">
        <div>
          <Label htmlFor="file">Fakturajournal (xlsx eller csv)</Label>
          <Input
            id="file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setParsed(null);
              setAnalyseFejl(null);
            }}
            disabled={working || !!running}
          />
          {file && (
            <p className="text-xs text-muted-foreground mt-1">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAnalyse} disabled={!file || working || !!running}>
            <Search className="h-4 w-4 mr-2" /> Analysér fil
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!parsed || working || !!running || (afvigende.length > 0 && !bekraeftAfvigende)}
          >
            {working && parsed ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Arbejder…</>
            ) : (
              <><FileUp className="h-4 w-4 mr-2" /> Start import</>
            )}
          </Button>
        </div>

        {analyseFejl && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive whitespace-pre-wrap">
            {analyseFejl}
          </div>
        )}

        {parsed && <FilOpsummering stats={parsed.stats} />}

        {parsed && afvigende.length > 0 && (
          <div className="rounded-lg border border-destructive/60 bg-destructive/5 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {afvigende.reduce((s, m) => s + m.linjer, 0).toLocaleString("da-DK")} linjer ligger mere end{" "}
              {AFVIGENDE_MAANEDER} måneder fra filens hovedperiode
            </div>
            <ul className="text-xs list-disc pl-5">
              {afvigende.map((m) => (
                <li key={`${m.afdeling_nr}|${m.maaned}`}>
                  Afd. {m.afdeling_nr} · {maanedNavn(m.maaned)}: {m.linjer} linjer ({m.fra} – {m.til})
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Importen rydder og genberegner også disse måneder (kun datoerne fra {"første"} til sidste linje i hver måned).
              Ret filen i Visma, hvis linjerne er en fejl.
            </p>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={bekraeftAfvigende} onCheckedChange={(v) => setBekraeftAfvigende(v === true)} />
              Jeg har set advarslen og vil importere alligevel
            </label>
          </div>
        )}

        {working && stage && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{stage}</span>
            </div>
            {stagePct !== null && (
              <>
                <Progress value={stagePct} />
                <p className="text-xs text-muted-foreground">
                  {stageProgress!.done} / {stageProgress!.total} chunks
                </p>
              </>
            )}
          </div>
        )}

        {job && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {job.status === "completed"
                  ? "Import færdig"
                  : job.status === "failed"
                    ? "Import fejlede"
                    : (PHASE_LABEL[job.phase] ?? `Fase: ${job.phase}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                Job: <code>{job.id.slice(0, 8)}</code> · forsøg {job.attempts}
              </span>
            </div>

            {(job.total_lines ?? 0) > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>Fakturalinjer (rådata)</span>
                  <span className="text-muted-foreground">
                    {(job.saved_lines ?? 0).toLocaleString("da-DK")} /{" "}
                    {(job.total_lines ?? 0).toLocaleString("da-DK")}
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    Math.round(((job.saved_lines ?? 0) / (job.total_lines || 1)) * 100),
                  )}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {job.locations_matched.toLocaleString("da-DK")} lev.nr. matchet til lokationer
              {Array.isArray(job.unmatched_delivery_nos) && job.unmatched_delivery_nos.length > 0 && (
                <> · {job.unmatched_delivery_nos.length} uden match</>
              )}
              {(job.months_rebuilt ?? 0) > 0 && (
                <> · {(job.months_rebuilt ?? 0).toLocaleString("da-DK")} måneder genberegnet</>
              )}
            </p>

            {rowsByAfdeling && Object.keys(rowsByAfdeling).length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Linjer pr. afdeling:</span>{" "}
                {Object.entries(rowsByAfdeling)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([afd, n]) => `afd ${afd}: ${n.toLocaleString("da-DK")}`)
                  .join(" · ")}
              </div>
            )}

            {job.status === "completed" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" /> Færdig — salgsdata genberegnet
                </div>
                <p className="text-xs text-muted-foreground">
                  {(job.saved_lines ?? 0).toLocaleString("da-DK")} linjer skrevet ·{" "}
                  {(job.lines_deleted ?? 0).toLocaleString("da-DK")} linjer slettet ·{" "}
                  {(job.months_rebuilt ?? 0).toLocaleString("da-DK")} måneder genberegnet
                  {job.lines_date_from && job.lines_date_to && (
                    <> · periode {job.lines_date_from} – {job.lines_date_to}</>
                  )}
                </p>
              </div>
            )}

            {job.last_error && (
              <p className="text-xs text-destructive">Fejl: {job.last_error}</p>
            )}
          </div>
        )}
      </Card>

      <ImportKolonneTjekliste kontrakt={IMPORT_KONTRAKTER.faktura} />
    </div>
  );
}

const MAANEDER = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function maanedNavn(iso: string) {
  return `${MAANEDER[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

function FilOpsummering({ stats }: { stats: ParseStats }) {
  const afdelinger = Array.from(new Set(stats.maaneder.map((m) => m.afdeling_nr))).sort((a, b) => a - b);
  const maaneder = Array.from(new Set(stats.maaneder.map((m) => m.maaned))).sort();
  const get = (afd: number, md: string) => stats.maaneder.find((m) => m.afdeling_nr === afd && m.maaned === md);
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
      <div className="font-medium">Filen indeholder</div>
      <p className="text-xs text-muted-foreground">
        Format: {stats.format} kolonner{stats.format === "20" && " (gammelt format — kolonne 6–8 ignoreres)"} ·{" "}
        {stats.linesRead.toLocaleString("da-DK")} fakturalinjer · {stats.uniqueDeliveryNos.toLocaleString("da-DK")} leveringsnumre ·{" "}
        {stats.subtotalRows.toLocaleString("da-DK")} subtotalrækker sorteret fra
        {stats.hovedmaaned && <> · hovedperiode omkring {maanedNavn(stats.hovedmaaned)}</>}
      </p>
      <DbAfstemningRapport a={stats.dbAfstemning} />
      {stats.ikkeFaktureret > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {stats.ikkeFaktureret.toLocaleString("da-DK")} ikke-fakturerede linjer sprunget over
          </span>{" "}
          (fakturadato "0" eller tom)
          {stats.ikkeFaktureret > stats.ikkeFaktureretEksempler.length && <> — viser de første {stats.ikkeFaktureretEksempler.length}</>}
          <table className="mt-1 tabular-nums">
            <thead><tr className="text-left"><th className="pr-4">Ordrenr.</th><th className="pr-4">Varenr.</th><th className="text-right">Beløb</th></tr></thead>
            <tbody>
              {stats.ikkeFaktureretEksempler.map((e, i) => (
                <tr key={i}><td className="pr-4">{e.ordre_nr}</td><td className="pr-4">{e.varenr}</td><td className="text-right">{e.beloeb}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {stats.fejlRaekker > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400">
          {stats.fejlRaekker} rækker med ugyldig dato/beløb/DB springes over (under grænsen):
          <ul className="list-disc pl-5">{stats.fejlEksempler.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-1 pr-3">Måned</th>
              {afdelinger.map((a) => <th key={a} className="py-1 pr-3 text-right">Afd. {a}</th>)}
            </tr>
          </thead>
          <tbody>
            {maaneder.map((md) => {
              const afv = stats.maaneder.some((m) => m.maaned === md && m.afvigende);
              return (
                <tr key={md} className={afv ? "text-destructive font-medium" : ""}>
                  <td className="py-1 pr-3">{maanedNavn(md)}{afv && " ⚠"}</td>
                  {afdelinger.map((a) => {
                    const m = get(a, md);
                    return (
                      <td key={a} className="py-1 pr-3 text-right tabular-nums" title={m ? `${m.fra} – ${m.til}` : undefined}>
                        {m ? m.linjer.toLocaleString("da-DK") : "–"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Kun månederne ovenfor ryddes og genberegnes.</p>
    </div>
  );
}

const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr.`;
function topVg(m: Record<string, number>) {
  return Object.entries(m).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5)
    .map(([k, v]) => `${k}: ${kr(v)}`).join(" · ");
}
function DbAfstemningRapport({ a }: { a: ParseStats["dbAfstemning"] }) {
  const totalOk = a.totallinjeDb == null ? null : Math.abs(a.linjeDbEfter - a.totallinjeDb) <= 1;
  const uafklarede = a.summeringer.filter((s) => s.udfald === "uafklaret");
  const vis = [...new Map([...uafklarede, ...a.afvigelser].map((s) => [s.visma_delivery_no, s])).values()];
  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium text-foreground">DB-afstemning mod Vismas summeringslinjer</div>
      <ul className="list-disc pl-5 text-muted-foreground">
        <li>{(a.antal.uaendret).toLocaleString("da-DK")} kunder uden ændring</li>
        <li>
          {(a.antal.udledt + a.antal.udledt_80).toLocaleString("da-DK")} kunder hvor DB 0-linjer bliver 100 % ({kr(a.udledtBeloeb)})
          {a.antal.udledt_80 > 0 && <> — heraf {a.antal.udledt_80} kun på varegruppe 2 = 80</>}
          {topVg(a.udledtPrVaregruppe) && <> · {topVg(a.udledtPrVaregruppe)}</>}
        </li>
        <li>
          {a.antal.db0_korrekt.toLocaleString("da-DK")} kunder hvor DB 0 er rigtig
          {topVg(a.db0KorrektPrVaregruppe) && <> · {topVg(a.db0KorrektPrVaregruppe)}</>}
        </li>
        <li className={a.antal.uafklaret ? "text-amber-700 dark:text-amber-400" : ""}>
          {a.antal.uafklaret} uafklarede kunder (DB uændret)
        </li>
        <li>
          DB i alt: {kr(a.linjeDbFoer)} fra linjerne → {kr(a.linjeDbEfter)} efter udledning
          {a.totallinjeDb != null ? <> · Vismas totallinje {kr(a.totallinjeDb)}</> : <> · totallinje ikke fundet</>}
          {totalOk === true && " ✓"}
        </li>
        {a.linjerUdenSummering > 0 && <li>{a.linjerUdenSummering} linjer uden summeringslinje (DB uændret)</li>}
      </ul>
      {(totalOk === false || vis.length > 0) && (
        <div className="text-amber-700 dark:text-amber-400">
          {totalOk === false && <div>Filens DB rammer ikke totallinjen (afvigelse {kr(a.linjeDbEfter - (a.totallinjeDb ?? 0))}).</div>}
          {vis.length > 0 && (
            <table className="mt-1 tabular-nums">
              <thead><tr className="text-left"><th className="pr-4">Kundenr.</th><th className="pr-4 text-right">Summering DB</th><th className="pr-4 text-right">Linjer DB</th><th>Udfald</th></tr></thead>
              <tbody>
                {vis.slice(0, 50).map((s) => (
                  <tr key={s.visma_delivery_no}><td className="pr-4">{s.visma_delivery_no}</td><td className="pr-4 text-right">{kr(s.db_summering)}</td><td className="pr-4 text-right">{kr(s.db_linjer_efter)}</td><td>{s.udfald}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
