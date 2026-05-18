import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { checkCvrConnection } from "@/lib/cvr-import.functions";

export function CvrApiStatusKort() {
  const checkFn = useServerFn(checkCvrConnection);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ configured: boolean; ok: boolean; error?: string } | null>(null);

  async function run() {
    setLoading(true);
    try {
      const res = await checkFn();
      setStatus(res);
    } catch (e: any) {
      setStatus({ configured: false, ok: false, error: e?.message ?? "Fejl" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void run(); }, []);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold mb-1">CVR API-adgang</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Tester forbindelse…
            </p>
          ) : status?.ok ? (
            <p className="text-sm flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" /> CVR API forbundet
            </p>
          ) : (
            <p className="text-sm flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              {status?.configured ? `Ikke OK: ${status.error}` : "Ikke konfigureret"}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Brugernavn og password til CVR-registret er gemt som secrets (<code>CVR_USERNAME</code>,{" "}
            <code>CVR_PASSWORD</code>). Kontakt udvikleren for at ændre dem.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={run} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" /> Test igen
        </Button>
      </div>
    </Card>
  );
}
