import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCvrEnrichmentQueueStatus } from "@/lib/admin-companies.functions";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

export function CvrEnrichmentQueueBadge() {
  const fetchStatus = useServerFn(getCvrEnrichmentQueueStatus);
  const [s, setS] = useState<{ pending: number; processing: number; failed: number } | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetchStatus();
        if (!stop) setS(res);
      } catch {
        if (!stop) setS(null);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s) return null;
  const active = s.pending + s.processing;
  if (active === 0 && s.failed === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {active > 0 && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>
            <strong>{active.toLocaleString("da-DK")}</strong> virksomheder venter på CVR-berigelse
            {s.processing > 0 && ` (${s.processing} i gang)`}
          </span>
        </div>
      )}
      {s.failed > 0 && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            <strong>{s.failed.toLocaleString("da-DK")}</strong> virksomheder fejlede berigelse
          </span>
        </div>
      )}
      {active === 0 && s.failed === 0 && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>CVR-berigelseskø er tom</span>
        </div>
      )}
    </div>
  );
}
