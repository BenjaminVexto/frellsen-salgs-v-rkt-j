import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rytmeTekst } from "@/lib/kunde-rytme";

/** Købsrytme for kundekortet (kun ved interval på 2 mdr. eller mere). */
export function KundeRytmeLinje({ companyId, className }: { companyId: string; className?: string }) {
  const q = useQuery({
    queryKey: ["kunde-rytme", companyId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("customer_type, rytme_koebsmaaneder, rytme_interval_mdr, naeste_koeb_forventet, over_rytme")
        .eq("id", companyId)
        .maybeSingle();
      return data as any;
    },
  });
  const c = q.data;
  if (!c) return null;
  const tekst = rytmeTekst({
    koebsmaaneder: c.rytme_koebsmaaneder,
    intervalMdr: c.rytme_interval_mdr != null ? Number(c.rytme_interval_mdr) : null,
    naesteForventet: c.naeste_koeb_forventet,
    overRytme: !!c.over_rytme,
    aktiv: c.customer_type === "aktiv_kunde",
  });
  if (!tekst) return null;
  return <p className={`text-xs text-muted-foreground ${className ?? ""}`}>{tekst}</p>;
}
