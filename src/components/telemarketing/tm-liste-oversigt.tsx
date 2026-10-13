import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hentAlle } from "@/lib/hent-alle";
import { Card } from "@/components/ui/card";
import { Loader2, Phone } from "lucide-react";

type L = { id: string; name: string; purpose: string | null; total: number; tilbage: number };

/** Bureauets forside: kun de lister brugeren er sat på (styret af RLS). */
export function TmListeOversigt() {
  const [lister, setLister] = useState<L[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data: ls } = await supabase.from("contact_lists").select("id, name, purpose").eq("is_active", true).order("created_at", { ascending: false });
      const ids = (ls ?? []).map((l) => l.id);
      const as: any[] = ids.length
        ? await hentAlle((f, t) =>
            supabase.from("contact_list_assignments").select("id, contact_list_id, status").in("contact_list_id", ids).order("id").range(f, t),
          ).catch(() => [])
        : [];
      setLister(
        (ls ?? []).map((l: any) => {
          const r = (as ?? []).filter((a: any) => a.contact_list_id === l.id);
          return {
            ...l,
            total: r.length,
            tilbage: r.filter((a: any) => ["ny", "forsoegt", "ring_igen"].includes(a.status)).length,
          };
        }),
      );
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Mine ringelister</h1>
      {lister === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : lister.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Du er ikke sat på nogen lister endnu.</Card>
      ) : (
        lister.map((l) => (
          <Link key={l.id} to="/kontaktlister/$id" params={{ id: l.id }}>
            <Card className="p-4 hover:bg-muted/50 transition-colors flex items-center gap-4">
              <Phone className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{l.name}</div>
                {l.purpose && <div className="text-xs text-muted-foreground line-clamp-1">{l.purpose}</div>}
              </div>
              <div className="text-sm tabular-nums text-right">
                {l.tilbage} tilbage
                <div className="text-xs text-muted-foreground">af {l.total}</div>
              </div>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
