/** "Senest åbnet" firmaer pr. bruger i localStorage (kun visning, ingen data i databasen). */
export type SenestAabnet = { id: string; name: string; city: string | null };
const noegle = (userId: string) => `senest-aabnet:${userId}`;
const MAKS = 5;

export function hentSenestAabnet(userId: string | null | undefined): SenestAabnet[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(noegle(userId)) ?? "[]");
    return Array.isArray(v) ? v.slice(0, MAKS) : [];
  } catch {
    return [];
  }
}

export function gemSenestAabnet(userId: string | null | undefined, f: SenestAabnet) {
  if (!userId || typeof window === "undefined") return;
  try {
    const liste = [f, ...hentSenestAabnet(userId).filter((x) => x.id !== f.id)].slice(0, MAKS);
    localStorage.setItem(noegle(userId), JSON.stringify(liste));
  } catch {}
}
