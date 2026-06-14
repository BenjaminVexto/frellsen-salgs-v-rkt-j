import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { da } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/admin/maskiner/arkiv")({
  component: MaskinerArkivSide,
});

function MaskinerArkivSide() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  const machinesQ = useQuery({
    enabled: auth.role === "admin",
    queryKey: ["arkiv-machines"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("machines")
        .select(
          "id, serienr, beskrivelse, varenr, navn, fak_kundenr, lev_kundenr, udgaaet_dato, last_seen_import",
        )
        .eq("record_status", "udgaaet")
        .order("udgaaet_dato", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const enrichQ = useQuery({
    enabled: auth.role === "admin",
    queryKey: ["arkiv-enrichment"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("machine_enrichment")
        .select("serienr, udgaaet_dato, last_seen_import, binding_ophor, handlingsdato")
        .eq("record_status", "udgaaet")
        .order("udgaaet_dato", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fmt = (s?: string | null) =>
    s ? format(parseISO(s), "d. MMM yyyy", { locale: da }) : "–";

  return (
    <div className="px-4 md:px-8 py-8 max-w-5xl mx-auto pb-24 md:pb-8">
      <Link
        to="/admin/import/maskiner"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Tilbage til import
      </Link>
      <h1 className="text-2xl md:text-3xl font-semibold mb-2 flex items-center gap-2">
        <Archive className="h-6 w-6" /> Arkiv: udgåede maskiner
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Maskiner og enrichment-rækker, der ikke længere optræder i Visma-master. Bevaret som
        historik — skjult fra aktive visninger.
      </p>

      <Card className="p-4 md:p-6 mb-6">
        <h2 className="font-semibold mb-3 flex items-center justify-between">
          <span>Maskiner</span>
          <Badge variant="secondary">{machinesQ.data?.length ?? 0}</Badge>
        </h2>
        {machinesQ.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Henter…</div>
        ) : !machinesQ.data?.length ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Ingen udgåede maskiner.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-3">Serienr</th>
                  <th className="py-2 pr-3">Beskrivelse</th>
                  <th className="py-2 pr-3">Kunde</th>
                  <th className="py-2 pr-3">Sidst set</th>
                  <th className="py-2 pr-3">Udgået</th>
                </tr>
              </thead>
              <tbody>
                {machinesQ.data.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{m.serienr ?? "–"}</td>
                    <td className="py-2 pr-3">{m.beskrivelse ?? "–"}</td>
                    <td className="py-2 pr-3">{m.navn ?? m.fak_kundenr ?? "–"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmt(m.last_seen_import)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmt(m.udgaaet_dato)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 md:p-6">
        <h2 className="font-semibold mb-3 flex items-center justify-between">
          <span>Wittenborg-enrichment</span>
          <Badge variant="secondary">{enrichQ.data?.length ?? 0}</Badge>
        </h2>
        {enrichQ.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Henter…</div>
        ) : !enrichQ.data?.length ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Ingen udgåede enrichment-rækker.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-3">Serienr</th>
                  <th className="py-2 pr-3">Binding ophør</th>
                  <th className="py-2 pr-3">Handlingsdato</th>
                  <th className="py-2 pr-3">Sidst set</th>
                  <th className="py-2 pr-3">Udgået</th>
                </tr>
              </thead>
              <tbody>
                {enrichQ.data.map((e) => (
                  <tr key={e.serienr} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{e.serienr}</td>
                    <td className="py-2 pr-3">{fmt(e.binding_ophor)}</td>
                    <td className="py-2 pr-3">{fmt(e.handlingsdato)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmt(e.last_seen_import)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmt(e.udgaaet_dato)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
