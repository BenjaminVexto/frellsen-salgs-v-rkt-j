import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

type R = { created_at: string; agent_code: string | null };

export function KundetjekStatistik({ listId }: { listId: string }) {
  const [rows, setRows] = useState<R[] | null>(null);
  useEffect(() => {
    const fra = new Date(Date.now() - 30 * 864e5).toISOString();
    void (supabase as any).from("kundetjek_log").select("created_at, agent_code").eq("contact_list_id", listId).gte("created_at", fra).order("created_at", { ascending: false }).limit(10000)
      .then(({ data }: { data: R[] | null }) => setRows(data ?? []));
  }, [listId]);
  const { dage, agenter } = useMemo(() => {
    const m = new Map<string, Map<string, number>>(); const a = new Set<string>();
    for (const r of rows ?? []) {
      const d = r.created_at.slice(0, 10); const k = r.agent_code ?? "–"; a.add(k);
      const x = m.get(d) ?? new Map(); x.set(k, (x.get(k) ?? 0) + 1); m.set(d, x);
    }
    return { dage: [...m.entries()], agenter: [...a].sort() };
  }, [rows]);
  if (!rows) return null;
  return (
    <Card className="p-4 mb-4">
      <div className="text-sm font-semibold mb-2">Kundetjek – sidste 30 dage ({rows.length})</div>
      {rows.length === 0 ? <div className="text-sm text-muted-foreground">Ingen kundetjek endnu.</div> : (
        <table className="text-sm tabular-nums">
          <thead><tr className="text-muted-foreground text-xs"><th className="text-left pr-4 font-normal">Dag</th>{agenter.map(a => <th key={a} className="text-right px-2 font-normal">Agent {a}</th>)}<th className="text-right pl-3 font-normal">I alt</th></tr></thead>
          <tbody>{dage.map(([d, x]) => (
            <tr key={d}><td className="pr-4">{new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</td>{agenter.map(a => <td key={a} className="text-right px-2">{x.get(a) ?? ""}</td>)}<td className="text-right pl-3 font-medium">{[...x.values()].reduce((s, n) => s + n, 0)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}
