// Fælles udfald/status for kontaktlister – bruges af både bureauets ringevisning og listevisningen.

export type Udfald =
  | "ingen_svar"
  | "ring_igen"
  | "forkert_nummer"
  | "ikke_interesseret"
  | "oensker_ikke_kontakt"
  | "tilbud_oensket"
  | "moede_booket"
  | "ikke_opnaaet";

export const UDFALD_LABEL: Record<Udfald, string> = {
  ingen_svar: "Ingen svar",
  ring_igen: "Optaget / ring igen",
  forkert_nummer: "Forkert nummer",
  ikke_interesseret: "Ikke interesseret",
  oensker_ikke_kontakt: "Ønsker ikke kontakt",
  tilbud_oensket: "Ønsker tilbud/materiale",
  moede_booket: "Møde booket",
  ikke_opnaaet: "Ikke opnået",
};

/** Udfald man kan vælge (Ikke opnået sættes automatisk efter 3 × ingen svar). */
export const VALGBARE_UDFALD: Udfald[] = [
  "ingen_svar", "ring_igen", "forkert_nummer", "ikke_interesseret", "oensker_ikke_kontakt", "tilbud_oensket", "moede_booket",
];

export const AARSAGER = [
  { v: "har_leverandoer", l: "Har leverandør" },
  { v: "ingen_kaffe", l: "Ingen kaffe" },
  { v: "for_lille", l: "For lille" },
  { v: "andet", l: "Andet" },
];
export const aarsagLabel = (v: string | null | undefined) => (v ? AARSAGER.find((a) => a.v === v)?.l ?? v : "");

/** Status på listen (afledt af seneste udfald). */
export type ListeStatus =
  | "ny" | "forsoegt" | "ring_igen" | "forkert_nummer" | "ikke_interesseret"
  | "oensker_ikke_kontakt" | "tilbud_oensket" | "møde_booket" | "ikke_opnaaet";

export const STATUS_LABEL: Record<ListeStatus, string> = {
  ny: "Ny",
  forsoegt: "Forsøgt",
  ring_igen: "Ring igen",
  forkert_nummer: "Forkert nummer",
  ikke_interesseret: "Ikke interesseret",
  oensker_ikke_kontakt: "Ønsker ikke kontakt",
  tilbud_oensket: "Tilbud ønsket",
  "møde_booket": "Møde booket",
  ikke_opnaaet: "Ikke opnået",
};
export const LISTE_STATUSSER = Object.keys(STATUS_LABEL) as ListeStatus[];

/** Mærketekst, fx "Ikke interesseret · Har leverandør" eller "Forsøgt (2)". */
export function statusTekst(status: string, aarsag?: string | null, forsoeg?: number | null): string {
  const l = STATUS_LABEL[status as ListeStatus] ?? status;
  if (status === "ikke_interesseret" && aarsag) return `${l} · ${aarsagLabel(aarsag)}`;
  if ((status === "forsoegt" || status === "ikke_opnaaet") && forsoeg) return `${l} (${forsoeg})`;
  return l;
}

/** Stadig åbne til opkald (bruges til "tilbage"-tællere). */
export const AABNE_STATUSSER: ListeStatus[] = ["ny", "forsoegt", "ring_igen"];

/** "Opnået" = man fik fat i nogen. */
export const OPNAAET: Udfald[] = ["ring_igen", "ikke_interesseret", "oensker_ikke_kontakt", "tilbud_oensket", "moede_booket"];
/** "Succes" = møde booket eller tilbud ønsket. */
export const SUCCES: Udfald[] = ["moede_booket", "tilbud_oensket"];

export type Registrering = { company_id: string; udfald: Udfald; user_id: string; rolle?: string | null };

/** Statistik over alle registreringer på en liste, uanset om bureau eller sælger registrerede. */
export function udfaldStatistik(regs: Registrering[]) {
  const ringet = new Set(regs.map((r) => r.company_id)).size;
  const opnaaet = new Set(regs.filter((r) => OPNAAET.includes(r.udfald)).map((r) => r.company_id)).size;
  const succes = new Set(regs.filter((r) => SUCCES.includes(r.udfald)).map((r) => r.company_id)).size;
  return {
    ringet,
    opkald: regs.length,
    opnaaet,
    moeder: regs.filter((r) => r.udfald === "moede_booket").length,
    tilbud: regs.filter((r) => r.udfald === "tilbud_oensket").length,
    succes,
    succesrate: opnaaet ? succes / opnaaet : 0,
  };
}

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
 * nye, derefter "Forsøgt" (færrest forsøg først).
 */
export function byggKoe<T extends KoeRaekke>(rows: T[], nu: Date = new Date()): T[] {
  const seneste = (r: T) => [...r.opkald].sort((a, b) => b.at.localeCompare(a.at))[0];
  const forfalden: { r: T; t: string }[] = [];
  const nye: T[] = [];
  const ingenSvar: T[] = [];
  for (const r of rows) {
    const s = seneste(r);
    if (!s) {
      if (r.status === "ny") nye.push(r);
      continue;
    }
    if (r.status === "ring_igen" && s.udfald === "ring_igen" && s.ring_igen_at && new Date(s.ring_igen_at) <= nu) forfalden.push({ r, t: s.ring_igen_at });
    else if (r.status === "forsoegt") ingenSvar.push(r);
  }
  forfalden.sort((a, b) => a.t.localeCompare(b.t));
  ingenSvar.sort((a, b) => a.opkald.length - b.opkald.length);
  return [...forfalden.map((x) => x.r), ...nye, ...ingenSvar];
}
