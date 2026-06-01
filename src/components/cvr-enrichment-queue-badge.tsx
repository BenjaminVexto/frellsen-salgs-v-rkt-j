import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getCvrEnrichmentQueueStatus,
  requeueFailedCvrEnrichment,
} from "@/lib/admin-companies.functions";
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Status = {
  campaign_id: string | null;
  total: number;
  done: number;
  failed: number;
  pending: number;
  processing: number;
  started_at: string | null;
  finished_at: string | null;
};

export function CvrEnrichmentQueueBadge({ variant = "card" }: { variant?: "card" | "compact" }) {
  const fetchStatus = useServerFn(getCvrEnrichmentQueueStatus);
  const requeue = useServerFn(requeueFailedCvrEnrichment);
  const [s, setS] = useState<Status | null>(null);
  const [requeuing, setRequeuing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const res = (await fetchStatus()) as Status;
      setS(res);
    } catch {
      setS(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    timerRef.current = setInterval(load, 15000);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop polling når køen er helt tom (intet aktivt, intet fejlet).
  useEffect(() => {
    if (!s) return;
    const active = s.pending + s.processing;
    if (active === 0 && s.failed === 0 && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [s]);

  if (!s || s.campaign_id === null || s.total === 0) return null;

  const active = s.pending + s.processing;
  const processed = s.done + s.failed; // tæller fejlede med — så linjen rammer 100%
  const pct = s.total > 0 ? Math.min(100, Math.round((processed / s.total) * 1000) / 10) : 0;
  const isComplete = active === 0;
  const hasFailed = s.failed > 0;

  async function onRequeue() {
    setRequeuing(true);
    try {
      const res = (await requeue()) as { requeued: number };
      if (res.requeued === 0) {
        toast.info("Ingen fejlede jobs at re-køre");
      } else {
        toast.success(`${res.requeued} fejlede jobs lagt i kø igen`);
      }
      // Genoptag polling
      if (!timerRef.current) timerRef.current = setInterval(load, 15000);
      await load();
    } catch (e: any) {
      toast.error("Kunne ikke re-køre: " + (e?.message ?? e));
    } finally {
      setRequeuing(false);
    }
  }

  // Kompakt visning (lille badge — bruges fx på Visma-importsiden)
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {!isComplete && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>
              CVR-berigelse: <strong>{pct}%</strong> ·{" "}
              {processed.toLocaleString("da-DK")}/{s.total.toLocaleString("da-DK")}
            </span>
          </div>
        )}
        {hasFailed && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span><strong>{s.failed.toLocaleString("da-DK")}</strong> fejlet</span>
          </div>
        )}
        {isComplete && !hasFailed && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>CVR-berigelse færdig · {s.done.toLocaleString("da-DK")} beriget</span>
          </div>
        )}
      </div>
    );
  }

  // Card-visning (Importhistorik)
  const toneBorder = isComplete && !hasFailed
    ? "border-emerald-200 bg-emerald-50/50"
    : hasFailed && isComplete
    ? "border-destructive/40 bg-destructive/5"
    : "border-amber-200 bg-amber-50/40";

  const barColor = isComplete && !hasFailed
    ? "bg-emerald-500"
    : hasFailed
    ? "bg-amber-500"
    : "bg-amber-500";

  return (
    <div className={`rounded-lg border p-4 ${toneBorder}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          {isComplete && !hasFailed ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : isComplete && hasFailed ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-amber-700" />
          )}
          <div>
            <div className="font-semibold text-sm">
              {isComplete && !hasFailed
                ? "CVR-berigelse færdig"
                : isComplete && hasFailed
                ? "CVR-berigelse afsluttet med fejl"
                : "CVR-berigelse i gang"}
            </div>
            <div className="text-xs text-muted-foreground">
              {isComplete && !hasFailed
                ? `${s.done.toLocaleString("da-DK")} virksomheder beriget fra CVR`
                : `${pct}% · ${processed.toLocaleString("da-DK")}/${s.total.toLocaleString("da-DK")}${
                    s.processing > 0 ? ` · ${s.processing.toLocaleString("da-DK")} i gang nu` : ""
                  }`}
            </div>
          </div>
        </div>
        {hasFailed && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRequeue}
            disabled={requeuing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${requeuing ? "animate-spin" : ""}`} />
            {requeuing ? "Re-kører…" : "Kør fejlede igen"}
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {hasFailed && (
        <div className="mt-3 text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            <strong>{s.failed.toLocaleString("da-DK")}</strong> virksomheder fejlede berigelse (3 forsøg opbrugt)
          </span>
        </div>
      )}
    </div>
  );
}
