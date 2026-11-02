export type SaelgerAktivitet = { at: string; type: string; bruger: string | null };
export type KonkurrentAftale = { id: string; konkurrent: string; udloeb: string | null; note: string | null };
export type CallerOverblik = { seneste_saelger: SaelgerAktivitet | null; aftaler: KonkurrentAftale[] };
export type VirksomhedsHistorik = SaelgerAktivitet & {
  id: string; note: string | null; denne_liste: boolean; kilde: string;
  udfald: string | null; aarsag: string | null; ring_igen_at: string | null; moede_at: string | null;
};
export type SaelgerFilter = "alle" | "kun" | "uden";

export function saelgerAktiv(aktivitet: SaelgerAktivitet | null | undefined, nu: Date): boolean {
  if (!aktivitet || !["besøg", "møde", "teams_møde", "tilbud_sendt", "konkurrentaftale"].includes(aktivitet.type)) return false;
  const tid = Date.parse(aktivitet.at);
  return tid <= nu.getTime() && tid >= nu.getTime() - 90 * 24 * 60 * 60 * 1000;
}

export function matcherSaelgerFilter(aktiv: boolean, filter: SaelgerFilter): boolean {
  return filter === "alle" || (filter === "kun" ? aktiv : !aktiv);
}