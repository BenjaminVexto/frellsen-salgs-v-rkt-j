import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Phone } from "lucide-react";
import { AARSAGER, UDFALD_LABEL, type Udfald } from "@/lib/telemarketing";

type R = { id: string; created_at: string; udfald: Udfald; aarsag: string | null; note: string | null; rolle: string | null; user_id: string; contact_list_id: string };
const ROLLE: Record<string, string> = { telemarketing: "Bureau", saelger: "Sælger", admin: "Admin" };

/** Kundekort → Aktivitet: registreringer og noter fra kontaktlister (bureau og sælger). */
export function ListeNoterSektion({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<R[]>([]);
  const [navne, setNavne] = useState<Record<string, string>>({});
  const [lister, setLister] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      const sb = supabase as any;
      const { data } = await sb.from("kontaktliste_opkald").select("id, created_at, udfald, aarsag, note, rolle, user_id, contact_list_id")
        .eq("company_id", companyId).order("created_at", { ascending: false }).limit(200);
      const r = (data ?? []) as R[];
      setRows(r);
      const uids = [...new Set(r.map((x) => x.user_id))];
      const lids = [...new Set(r.map((x) => x.contact_list_id))];
      const [{ data: p }, { data: l }] = await Promise.all([
        uids.length ? sb.from("profiles").select("id, full_name").in("id", uids) : { data: [] },
        lids.length ? sb.from("contact_lists").select("id, name").in("id", lids) : { data: [] },
      ]);
      setNavne(Object.fromEntries((p ?? []).map((x: any) => [x.id, x.full_name])));
      setLister(Object.fromEntries((l ?? []).map((x: any) => [x.id, x.name])));
    })();
  }, [companyId]);
  if (!rows.length) return null;
  return (
    <Card className="p-5 mb-4">
      <h2 className="font-semibold flex items-center gap-2 mb-3"><Phone className="h-4 w-4" /> Fra kontaktlister ({rows.length})</h2>
      <div className="space-y-2">
        {rows.map((o) => (
          <div key={o.id} className="text-sm border-b last:border-0 pb-2">
            <div>
              <span className="tabular-nums text-muted-foreground mr-2">{new Date(o.created_at).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="font-medium">{UDFALD_LABEL[o.udfald] ?? o.udfald}</span>
              {o.aarsag && <span> · {AARSAGER.find((a) => a.v === o.aarsag)?.l ?? o.aarsag}</span>}
              <span className="text-muted-foreground"> · {navne[o.user_id] ?? "?"} ({ROLLE[o.rolle ?? ""] ?? "?"}) · {lister[o.contact_list_id] ?? "liste"}</span>
            </div>
            {o.note && <div className="text-muted-foreground whitespace-pre-wrap">{o.note}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}
