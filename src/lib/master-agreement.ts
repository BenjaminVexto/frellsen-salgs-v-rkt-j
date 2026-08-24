export type MasterAgreementSuppression = {
  agreementId: string;
  agreementName: string;
  validTo: string | null;
};

export type SuppressionMap = Record<string, MasterAgreementSuppression>;

/**
 * Maskiner hos kunder på en hovedaftale skal ikke give "udløber snart"-støj,
 * før hovedaftalen selv nærmer sig sit udløb.
 *
 * Returnerer true når advarslen skal undertrykkes:
 *  - virksomheden er dækket af en aftale med maskiner_folger_hovedaftale = true
 *  - OG aftalens valid_to er null (aldrig advarsel) eller ligger efter vinduet.
 */
export function isMachineWarningSuppressed(
  sup: MasterAgreementSuppression | null | undefined,
  windowEndIso: string,
): boolean {
  if (!sup) return false;
  if (!sup.validTo) return true;
  // Aftalen udløber selv i vinduet (eller er overskredet) → advar normalt.
  return sup.validTo > windowEndIso;
}

export function masterAgreementTooltip(sup: MasterAgreementSuppression): string {
  const dato = sup.validTo
    ? new Date(sup.validTo).toLocaleDateString("da-DK", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "ukendt dato";
  return `Udløber med ${sup.agreementName} d. ${dato}`;
}
