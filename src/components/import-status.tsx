import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { ImportType } from "@/lib/import-log";

export type ImportStatusRow = {
  import_type: ImportType;
  ok_at: string | null;
  ok_navn: string | null;
  ok_fil: string | null;
  fejl_at: string | null;
  fejl_tekst: string | null;
};

const DAG = 86400000;
export const MAX_ALDER_DAGE: Record<ImportType, number> = {
  aktoer: 8,
  faktura: 8,
  maskiner: 35,
  prismatrix: 35,
};

export function useImportStatus(enabled = true) {
  return useQuery({
    queryKey: ["import_status"],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("import_status");
      if (error) throw error;
      return (data ?? []) as ImportStatusRow[];
    },
    staleTime: 60 * 1000,
  });
}

export function useSenesteFakturadato() {
  return useQuery({
    queryKey: ["seneste_fakturadato"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("seneste_fakturadato");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });
}

const tz = { timeZone: "Europe/Copenhagen" } as const;
export const fmtDato = (iso: string) =>
  new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "numeric", year: "numeric", ...tz });
const fmtTid = (iso: string) =>
  new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", ...tz });
export const fmtRefDato = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export function ImportStatusLinjer({
  type,
  row,
  refDato,
}: {
  type: ImportType;
  row: ImportStatusRow | undefined;
  refDato: string | null | undefined;
}) {
  const link = (children: React.ReactNode, cls: string) => (
    <Link to="/admin/importhistorik" search={{ type }} className={`block hover:underline ${cls}`}>
      {children}
    </Link>
  );
  if (!row) return null;
  const gammel = row.ok_at && Date.now() - new Date(row.ok_at).getTime() > MAX_ALDER_DAGE[type] * DAG;
  const fejlNyere = row.fejl_at && (!row.ok_at || new Date(row.fejl_at) > new Date(row.ok_at));
  return (
    <div className="text-xs space-y-0.5">
      {row.ok_at
        ? link(
            <>
              ✓ Seneste import: {fmtDato(row.ok_at)} kl. {fmtTid(row.ok_at)}
              {row.ok_navn ? ` · ${row.ok_navn}` : ""}
            </>,
            gammel ? "text-warning font-medium" : "text-muted-foreground",
          )
        : link("Ikke importeret endnu", "text-muted-foreground")}
      {type === "faktura" && refDato &&
        link(<>Fakturaer til og med {fmtRefDato(refDato)}</>, "text-muted-foreground")}
      {fejlNyere &&
        link(
          <>
            ✕ Seneste forsøg fejlede {fmtDato(row.fejl_at!)} kl. {fmtTid(row.fejl_at!)} –{" "}
            {(row.fejl_tekst ?? "ukendt fejl").slice(0, 140)}
          </>,
          "text-destructive",
        )}
    </div>
  );
}

/** Advarsel til admins på Mit overblik, hvis der ikke er importeret fakturaer i 8 dage. */
export function FakturaImportAdvarsel() {
  const { data } = useImportStatus();
  const row = data?.find((r) => r.import_type === "faktura");
  if (!row) return null;
  if (row.ok_at && Date.now() - new Date(row.ok_at).getTime() <= 8 * DAG) return null;
  return (
    <Link
      to="/admin/import"
      className="block rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground hover:bg-warning/15"
    >
      {row.ok_at
        ? `Der er ikke importeret fakturaer siden ${fmtDato(row.ok_at)}.`
        : "Der er ikke importeret fakturaer endnu."}{" "}
      <span className="underline">Gå til Importér virksomheder</span>
    </Link>
  );
}
