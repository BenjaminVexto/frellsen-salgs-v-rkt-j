import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const search = z.object({ companyId: z.string().uuid() });

export const Route = createFileRoute("/_authenticated/tilbud/ny")({
  validateSearch: search,
  component: NyttTilbudPage,
});

function NyttTilbudPage() {
  const { companyId } = Route.useSearch();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const { data, error } = await supabase.rpc("create_quote_draft", {
        _company_id: companyId,
        _delivery_location_id: undefined,
        _pricing_mode: "purchase",
      });
      if (error || !data) {
        toast.error("Kunne ikke oprette tilbud: " + (error?.message ?? "ukendt fejl"));
        navigate({ to: "/virksomheder/$id", params: { id: companyId } });
        return;
      }
      navigate({ to: "/tilbud/$id", params: { id: data as string }, replace: true });
    })();
  }, [companyId, navigate]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Opretter tilbuds-kladde…
    </div>
  );
}
