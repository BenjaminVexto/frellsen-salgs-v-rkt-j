// Delte danske labels for forbrugssignalet — brug disse på ALLE flader,
// så samme kunde altid omtales med samme ordlyd.

export const KLASSE_LABEL: Record<string, string> = {
  let_fald: "Let fald",
  markant_fald: "Markant fald",
  kritisk: "Kritisk fald",
  stoppet: "Stoppet",
  afventer_rytme: "Inden for rytme",
  normal: "Normal",
  vaekst: "I vækst",
  ny: "Ny kunde",
};

export const AARSAG_LABEL: Record<string, string> = {
  faerre_ordrer: "Bestiller sjældnere",
  mindre_pr_ordre: "Mindre pr. ordre",
  faerre_og_mindre: "Både sjældnere og mindre",
  hyppigere_mindre: "Oftere, men mindre pr. gang",
  uklar: "Uklart mønster",
};

/** Klasser der betyder reelt fald i den primære gruppe (kaffe). */
export const FALD_KLASSER = ["let_fald", "markant_fald", "kritisk", "stoppet"] as const;

export function erFaldKlasse(klasse?: string | null): boolean {
  return !!klasse && (FALD_KLASSER as readonly string[]).includes(klasse);
}

export function klasseLabel(klasse?: string | null): string {
  return (klasse && KLASSE_LABEL[klasse]) || "Ukendt";
}

export function aarsagLabel(aarsag?: string | null): string | null {
  return (aarsag && AARSAG_LABEL[aarsag]) || null;
}
