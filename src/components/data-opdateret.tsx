import { fmtRefDato, useSenesteFakturadato } from "@/components/import-status";

/** "Data opdateret til [seneste fakturadato]" — orange hvis over 10 dage gammel. */
export function DataOpdateret({ className = "" }: { className?: string }) {
  const { data } = useSenesteFakturadato();
  if (!data) return null;
  const gammel = Date.now() - new Date(data + "T00:00:00Z").getTime() > 10 * 86400000;
  return (
    <p className={`text-xs ${gammel ? "text-warning font-medium" : "text-muted-foreground"} ${className}`}>
      Data opdateret til {fmtRefDato(data)}
    </p>
  );
}
