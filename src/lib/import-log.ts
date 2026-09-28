import { supabase } from "@/integrations/supabase/client";

export type ImportType = "aktoer" | "faktura" | "maskiner" | "prismatrix";

export const IMPORT_TYPE_LABEL: Record<ImportType, string> = {
  aktoer: "Aktør",
  faktura: "Faktura Journal",
  maskiner: "Maskinliste + Wittenborg",
  prismatrix: "Prismatrix",
};

/** Logger en import (ok/fejl). Ved fejl sender databasen notifikation til uploader + admins. */
export async function logImport(
  type: ImportType,
  status: "ok" | "fejl",
  filename: string | null | undefined,
  fejl?: string | null,
) {
  try {
    await (supabase as any).rpc("log_import", {
      _type: type,
      _status: status,
      _filename: filename ?? null,
      _fejl: fejl ?? null,
    });
  } catch (e) {
    console.error("[import-log]", e);
  }
}
