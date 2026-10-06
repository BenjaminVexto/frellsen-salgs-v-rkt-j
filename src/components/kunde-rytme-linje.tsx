import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { rytmeTekst } from "@/lib/kunde-rytme";

type Soester = { egen_konto: string | null; anden_konto: string | null; anden_company_id: string; anden_navn: string; retning: "koeber_paa" | "koebes_for" };

/** Købsrytme + søsterkonti (samme CVR og adresse) for kundekortet. */
export function KundeRytmeLinje({ companyId, className }: { companyId: string; className?: string }) {
  const q = useQuery({
    queryKey: ["kunde-rytme", companyId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: c } = await supabase
        .from("companies")
        .select("customer_type, rytme_koebsmaaneder, rytme_interval_mdr, naeste_koeb_forventet, over_rytme")
        .eq("id", companyId)
        .maybeSingle();
      const { data: egne } = await supabase
        .from("locations")
        .select("id, visma_delivery_no, koeber_paa_location_id")
        .eq("company_id", companyId);
      const egneIds = (egne ?? []).map((l) => l.id);
      const soestre: Soester[] = [];
      const udIds = (egne ?? []).map((l) => l.koeber_paa_location_id).filter(Boolean) as string[];
      if (udIds.length) {
        const { data } = await supabase
          .from("locations")
          .select("id, visma_delivery_no, company_id, companies(name)")
          .in("id", udIds);
        for (const l of egne ?? []) {
          const s = (data ?? []).find((x: any) => x.id === l.koeber_paa_location_id) as any;
          if (s) soestre.push({ egen_konto: l.visma_delivery_no, anden_konto: s.visma_delivery_no, anden_company_id: s.company_id, anden_navn: s.companies?.name ?? "", retning: "koeber_paa" });
        }
      }
      if (egneIds.length) {
        const { data } = await supabase
          .from("locations")
          .select("visma_delivery_no, company_id, koeber_paa_location_id, companies(name)")
          .in("koeber_paa_location_id", egneIds.slice(0, 200));
        for (const s of (data ?? []) as any[]) {
          const egen = (egne ?? []).find((l) => l.id === s.koeber_paa_location_id);
          soestre.push({ egen_konto: egen?.visma_delivery_no ?? null, anden_konto: s.visma_delivery_no, anden_company_id: s.company_id, anden_navn: s.companies?.name ?? "", retning: "koebes_for" });
        }
      }
      return { c: c as any, soestre };
    },
  });
  if (!q.data) return null;
  const { c, soestre } = q.data;
  const tekst = c ? rytmeTekst({
    koebsmaaneder: c.rytme_koebsmaaneder,
    intervalMdr: c.rytme_interval_mdr != null ? Number(c.rytme_interval_mdr) : null,
    naesteForventet: c.naeste_koeb_forventet,
    overRytme: !!c.over_rytme,
    aktiv: c.customer_type === "aktiv_kunde",
  }) : null;
  if (!tekst && !soestre.length) return null;
  return (
    <div className={`space-y-1 text-xs text-muted-foreground ${className ?? ""}`}>
      {tekst && <p>{tekst}</p>}
      {soestre.map((s, i) => (
        <p key={i} className="rounded border border-border bg-muted/40 px-2 py-1">
          {s.retning === "koeber_paa" ? (
            <>
              Konto {s.egen_konto ?? "—"} køber på konto <b className="text-foreground">{s.anden_konto}</b>
              {s.anden_company_id !== companyId && (
                <> (<Link to="/virksomheder/$id" params={{ id: s.anden_company_id }} className="underline">{s.anden_navn}</Link>)</>
              )}
            </>
          ) : (
            <>
              Søsterkonto <b className="text-foreground">{s.anden_konto}</b>
              {s.anden_company_id !== companyId && (
                <> (<Link to="/virksomheder/$id" params={{ id: s.anden_company_id }} className="underline">{s.anden_navn}</Link>)</>
              )}{" "}
              på samme adresse køber på konto {s.egen_konto ?? "—"}
            </>
          )}
        </p>
      ))}
    </div>
  );
}
