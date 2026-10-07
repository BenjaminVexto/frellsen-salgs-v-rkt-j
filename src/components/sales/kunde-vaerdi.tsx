import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

/** DB afrundet til nærmeste 100 kr. med tusindtalspunktum. */
export const fmtDb100 = (n: number) =>
  `${(Math.round(n / 100) * 100).toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.`;

/** Ændring mod året før; null når året før er 0/negativt/manglede (= ny kunde). */
export function aendringTekst(db: number, foer: number | null): string | null {
  if (foer == null || foer <= 0) return null;
  const p = Math.round(((db - foer) / foer) * 100);
  return `${p >= 0 ? "+" : ""}${p} %`;
}

/** Én tekstlinje øverst på Oversigt: rang i sælgerens portefølje målt på DB 12 hele mdr. */
export function KundeVaerdiLinje({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["kunde-db-rang", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("kunde_db_rang", { _company: companyId });
      if (error) throw error;
      return ((data ?? []) as any[])[0] ?? null;
    },
  });
  if (q.isLoading || q.error) return null;
  const r = q.data;
  if (!r) return <p className="text-sm text-muted-foreground">Intet salg de seneste 12 måneder</p>;
  const ejer = r.egen ? "din portefølje" : `${r.saelger_navn ?? "sælgerens"}s portefølje`;
  const ae = aendringTekst(Number(r.db), r.db_foer == null ? null : Number(r.db_foer));
  return (
    <p className="text-sm">
      Nr. {r.rang.toLocaleString("da-DK")} af {r.antal.toLocaleString("da-DK")} i {ejer} · DB 12 mdr:{" "}
      {fmtDb100(Number(r.db))} · {ae ? `${ae} i forhold til året før` : "ny kunde"}
    </p>
  );
}

/** "Dine 20 største kunder" — samme grundlag som KundeVaerdiLinje. */
export function Top20Kunder({ saelgerId }: { saelgerId: string | null }) {
  const q = useQuery({
    queryKey: ["kunde-db-rang-liste", saelgerId],
    enabled: !!saelgerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("kunde_db_rang_liste", { _saelger: saelgerId });
      if (error) throw error;
      return ((data ?? []) as any[]).sort((a, b) => a.rang - b.rang).slice(0, 20);
    },
  });
  if (!saelgerId || q.error) return null;
  return (
    <Card className="p-4 mb-6">
      <h2 className="text-sm font-semibold mb-2">Dine 20 største kunder · DB 12 hele måneder</h2>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Henter…</p>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted-foreground">Intet salg de seneste 12 måneder</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground text-left">
            <tr><th className="py-1 w-12">Rang</th><th>Kunde</th><th>By</th><th className="text-right">DB 12 mdr</th><th className="text-right">Ændring</th></tr>
          </thead>
          <tbody>
            {q.data.map((r: any) => (
              <tr key={r.company_id} className="border-t border-border">
                <td className="py-1 tabular-nums">{r.rang}</td>
                <td><Link to="/virksomheder/$id" params={{ id: r.company_id }} className="hover:underline">{r.navn}</Link></td>
                <td className="text-muted-foreground">{r.by ?? ""}</td>
                <td className="text-right tabular-nums">{fmtDb100(Number(r.db))}</td>
                <td className="text-right tabular-nums">{aendringTekst(Number(r.db), r.db_foer == null ? null : Number(r.db_foer)) ?? "ny kunde"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
