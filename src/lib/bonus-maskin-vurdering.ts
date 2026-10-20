export type MaskinRaekke = {
  company_id: string; navn: string; model: string; serienr: string; brugt: boolean; bonusklasse: string | null;
  status: "bonus" | "ingen" | "vurdering"; vurdering: "ombytning" | "opgradering" | null; aarsag: string | null;
  brugt_kilde: "tekst" | "anden_kunde" | "admin" | null; forgaenger_serienr: string | null; godkendt: boolean | null; sats: number;
};

export const OPGRADERING_TJEKLISTE = [
  { key: "stoerre_model", label: "Anden/større model" },
  { key: "binding_2aar", label: "Ny aftale med mindst 2 års binding" },
  { key: "ingen_tilbagekoeb", label: "Frellsen betaler ikke for den maskine, der tages retur" },
] as const;

export const AFVIS_AARSAGER = [
  "Ombytning inden for 24 måneder",
  "Teknisk ombytning",
  "Reklamation",
  "Tilbagekøb – Frellsen betaler for den gamle maskine",
  "Andet",
] as const;

/** Tæller rækker der blokerer en ren låsning: uklassificerede og uafgjorte vurderinger. */
export function opsummerMaskintjek(rows: Pick<MaskinRaekke, "status" | "bonusklasse">[]) {
  return {
    uklassificeret: rows.filter((r) => r.status === "vurdering" && !r.bonusklasse).length,
    tilVurdering: rows.filter((r) => r.status === "vurdering" && !!r.bonusklasse).length,
  };
}
