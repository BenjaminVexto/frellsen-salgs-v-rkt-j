/** Præsentation alene: sovende/tidligere konti bliver i deres eget afsnit,
 * også når de har mindre historisk omsætning (som BEC's to sovende konti). */
export function visSomAktivLokation(status: string | null, revenue: number | null, viaForhandler = false): boolean {
  if (viaForhandler) return true;
  if (status === "sovende_kunde" || status === "tidligere_kunde") return false;
  return status === "aktiv_kunde" || status === "servicekunde" || (revenue ?? 0) > 0;
}