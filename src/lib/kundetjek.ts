export type KundetjekStatus = "ikke_kunde" | "kunde" | "mulig_kunde" | "paa_ringeliste" | "ikke_kontakt" | "saelger_arbejder";

export type KundetjekHit = {
  cvr: string;
  p_number: string | null;
  navn: string | null;
  adresse: string | null;
  postnr: string | null;
  by: string | null;
  branche: string | null;
  ansatte: string | null;
  telefon: string | null;
  reklamebeskyttet: boolean;
  status: KundetjekStatus;
  saelger_navn: string | null;
  liste_navn: string | null;
  uden_for_distrikt: boolean;
};

export function erAktivCvr(status: string | null | undefined): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "AKTIV" || s === "NORMAL";
}

export function intervalTilAntal(interval: string | null | undefined): number | null {
  if (!interval) return null;
  const parts = interval.split("_").map((p) => parseInt(p, 10));
  if (isNaN(parts[0])) return null;
  if (parts.length > 1 && !isNaN(parts[1])) return Math.round((parts[0] + parts[1]) / 2);
  return parts[0];
}

/** Kan ringeren tilføje hittet? Kun ikke-kunder uden reklamebeskyttelse. */
export function kanTilfoejes(h: Pick<KundetjekHit, "status" | "reklamebeskyttet">): boolean {
  return h.status === "ikke_kunde" && !h.reklamebeskyttet;
}

/** Splitter indsatte CVR-numre (linjer, komma, semikolon, mellemrum). Højst 500 unikke. */
export function parseCvrListe(tekst: string): { cvrs: string[]; ugyldige: string[]; forMange: boolean } {
  const dele = tekst.split(/[\s,;]+/).map(s => s.replace(/^DK/i, "").replace(/-/g, "").trim()).filter(Boolean);
  const cvrs: string[] = []; const ugyldige: string[] = [];
  for (const d of dele) {
    if (/^\d{8}$/.test(d)) { if (!cvrs.includes(d)) cvrs.push(d); } else ugyldige.push(d);
  }
  return { cvrs: cvrs.slice(0, 500), ugyldige, forMange: cvrs.length > 500 };
}

export const KUNDETJEK_TEKST: Record<KundetjekStatus, (h: { saelger_navn: string | null; liste_navn: string | null }) => string> = {
  ikke_kunde: () => "Ikke kunde – må ringes op",
  kunde: (h) => `Eksisterende kunde – må ikke ringes op. Kontakt ${h.saelger_navn ?? "sælgeren"}`,
  mulig_kunde: (h) => `Muligvis eksisterende kunde (samme adresse/telefon) – aftal med ${h.saelger_navn ?? "sælgeren"} før opkald`,
  paa_ringeliste: (h) => `Ligger allerede på ringelisten ${h.liste_navn ?? ""}`.trim(),
  ikke_kontakt: () => "Ønsker ikke kontakt",
  saelger_arbejder: (h) => `En sælger arbejder allerede med virksomheden – kontakt ${h.saelger_navn ?? "sælgeren"}`,
};
