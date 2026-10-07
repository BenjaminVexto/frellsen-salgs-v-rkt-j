import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  const ejer = r.egen ? "kunder med salg i din portefølje" : `kunder med salg i ${r.saelger_navn ?? "sælgerens"}s portefølje`;
  const ae = aendringTekst(Number(r.db), r.db_foer == null ? null : Number(r.db_foer));
  return (
    <p className="text-sm">
      Nr. {r.rang.toLocaleString("da-DK")} af {r.antal.toLocaleString("da-DK")} i {ejer} · DB 12 mdr:{" "}
      {fmtDb100(Number(r.db))} · {ae ? `${ae} i forhold til året før` : "ny kunde"}
    </p>
  );
}
