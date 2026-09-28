import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { ImportType } from "@/lib/import-log";
import { useAfdeling } from "@/contexts/afdeling-context";

export type ImportStatusRow = {
  import_type: ImportType;
  ok_at: string | null;
  ok_navn: string | null;
  ok_fil: string | null;
  ok_afviste: number | null;
  seneste_data: string | null;
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
  const basis = row.ok_at ?? row.seneste_data;
  const gammel = basis && Date.now() - new Date(basis).getTime() > MAX_ALDER_DAGE[type] * DAG;
  const fejlNyere = row.fejl_at && (!row.ok_at || new Date(row.fejl_at) > new Date(row.ok_at));
  return (
    <div className="text-xs space-y-0.5">
      {row.ok_at
        ? link(
            <>
              ✓ Seneste import: {fmtDato(row.ok_at)} kl. {fmtTid(row.ok_at)}
              {row.ok_navn ? ` · ${row.ok_navn}` : ""}
              {row.ok_afviste ? ` · ${row.ok_afviste.toLocaleString("da-DK")} rækker afvist` : ""}
            </>,
            gammel ? "text-warning font-medium" : "text-muted-foreground",
          )
        : row.seneste_data
          ? link(<>Seneste data: {fmtDato(row.seneste_data)}</>, gammel ? "text-warning font-medium" : "text-muted-foreground")
          : link("Ikke importeret endnu", "text-muted-foreground")}
      {type === "faktura" && refDato && <FakturaTilOgMed refDato={refDato} />}
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

function FakturaTilOgMed({ refDato }: { refDato: string }) {
  const { afdelingFilter } = useAfdeling();
  const { data } = useQuery({
    queryKey: ["salg_uden_kunde", afdelingFilter],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("salg_uden_kunde", { _afd: afdelingFilter ?? null });
      if (error) throw error;
      return (data?.[0] ?? null) as { ikke_kunde_antal: number; ikke_kunde_beloeb: number; kunde_antal: number; kunde_beloeb: number } | null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const kr = (n: number) => Math.round(Number(n)).toLocaleString("da-DK");
  const ikke = Number(data?.ikke_kunde_antal ?? 0);
  const kunde = Number(data?.kunde_antal ?? 0);
  const til = (hvad: "ikke" | "kunde") => ({ type: "faktura" as const, vis: "uden_kunde" as const, hvad });
  return (
    <>
      <Link to="/admin/importhistorik" search={{ type: "faktura" }} className="block hover:underline text-muted-foreground">
        Fakturaer til og med {fmtRefDato(refDato)}
      </Link>
      {ikke > 0 && (
        <Link to="/admin/importhistorik" search={til("ikke")} className="block hover:underline text-muted-foreground">
          {ikke.toLocaleString("da-DK")} leveringsnr. findes ikke som kunde ({kr(data!.ikke_kunde_beloeb)} kr.)
        </Link>
      )}
      {kunde > 0 && (
        <Link to="/admin/importhistorik" search={til("kunde")} className="block hover:underline text-warning font-medium">
          {kunde.toLocaleString("da-DK")} leveringsnr. findes som kunde, men salget er ikke koblet ({kr(data!.kunde_beloeb)} kr.)
        </Link>
      )}
    </>
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
