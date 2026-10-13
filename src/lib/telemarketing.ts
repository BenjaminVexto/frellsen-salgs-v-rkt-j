// Fælles regler for telemarketing-ringevisningen.

export type Udfald =
  | "ingen_svar"
  | "ring_igen"
  | "forkert_nummer"
  | "ikke_interesseret"
  | "oensker_ikke_kontakt"
  | "moede_booket"
  | "ikke_opnaaet";

export const UDFALD_LABEL: Record<Udfald, string> = {
  ingen_svar: "Ingen svar",
  ring_igen: "Ring igen",
  forkert_nummer: "Forkert nummer",
  ikke_interesseret: "Ikke interesseret",
  oensker_ikke_kontakt: "Ønsker ikke kontakt",
  moede_booket: "Møde booket",
  ikke_opnaaet: "Ikke opnået",
};

export const AARSAGER = [
  { v: "har_leverandoer", l: "Har leverandør" },
  { v: "ingen_kaffe", l: "Ingen kaffe" },
  { v: "for_lille", l: "For lille" },
  { v: "andet", l: "Andet" },
];

/** "Opnået" = man fik et svar fra en beslutningstager. */
export const OPNAAET: Udfald[] = ["ikke_interesseret", "oensker_ikke_kontakt", "moede_booket"];

export type KoeOpkald = { at: string; udfald: Udfald; ring_igen_at: string | null };
export type KoeRaekke = { company_id: string; status: string; opkald: KoeOpkald[] };

/** Antal "Ingen svar" i træk efter seneste andet udfald. */
export function ingenSvarIRaekke(opkald: KoeOpkald[]): number {
  const s = [...opkald].sort((a, b) => b.at.localeCompare(a.at));
  let n = 0;
  for (const o of s) {
    if (o.udfald !== "ingen_svar") break;
    n++;
  }
  return n;
}

/**
 * Kø: forfaldne "Ring igen" først (ældste aftale først), derefter
 * ikke-kontaktede, derefter "Ingen svar" (færrest forsøg først).
 */
export function byggKoe<T extends KoeRaekke>(rows: T[], nu: Date = new Date()): T[] {
  const seneste = (r: T) => [...r.opkald].sort((a, b) => b.at.localeCompare(a.at))[0];
  const forfalden: { r: T; t: string }[] = [];
  const nye: T[] = [];
  const ingenSvar: T[] = [];
  for (const r of rows) {
    const s = seneste(r);
    if (!s) {
      if (r.status === "ny" || r.status === "skal_kontaktes") nye.push(r);
      continue;
    }
    if (s.udfald === "ring_igen" && s.ring_igen_at && new Date(s.ring_igen_at) <= nu) forfalden.push({ r, t: s.ring_igen_at });
    else if (s.udfald === "ingen_svar" && r.status === "kontaktet") ingenSvar.push(r);
  }
  forfalden.sort((a, b) => a.t.localeCompare(b.t));
  ingenSvar.sort((a, b) => a.opkald.length - b.opkald.length);
  return [...forfalden.map((x) => x.r), ...nye, ...ingenSvar];
}
