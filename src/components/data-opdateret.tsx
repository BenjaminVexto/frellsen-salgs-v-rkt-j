import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** "Data opdateret til [seneste fakturadato]" — samme dato som kundestatus regnes fra. */
export function DataOpdateret({ className = "" }: { className?: string }) {
  const { data } = useQuery({
    queryKey: ["seneste_fakturadato"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("seneste_fakturadato");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });
  if (!data) return null;
  const d = new Date(data + "T00:00:00Z").toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return <p className={`text-xs text-muted-foreground ${className}`}>Data opdateret til {d}</p>;
}
