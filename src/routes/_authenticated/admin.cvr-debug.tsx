import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { cvrDebugRaw } from "@/lib/cvr-debug.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cvr-debug")({
  component: CvrDebugPage,
});

function CvrDebugPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [cvr, setCvr] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  const handleFetch = async () => {
    setError(null);
    setResult(null);
    if (!/^\d{8}$/.test(cvr)) {
      setError("CVR skal være 8 cifre");
      return;
    }
    setLoading(true);
    try {
      const data = await cvrDebugRaw({ data: { cvr } });
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? "Fejl");
    } finally {
      setLoading(false);
    }
  };

  if (auth.loading || auth.role !== "admin") return null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">CVR Debug</h1>
        <p className="text-sm text-muted-foreground">
          Midlertidig debug-side. Viser rå JSON fra CVR.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="8-cifret CVR"
          value={cvr}
          onChange={(e) => setCvr(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => e.key === "Enter" && handleFetch()}
          className="max-w-xs"
        />
        <Button onClick={handleFetch} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hent"}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-destructive">{error}</div>
      )}

      {result != null && (
        <pre className="bg-muted text-xs p-4 rounded-md overflow-auto max-h-[70vh] border border-border">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
