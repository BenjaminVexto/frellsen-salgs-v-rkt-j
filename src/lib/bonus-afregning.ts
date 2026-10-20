/** Afregning af sælgerbonus: lønartsfordeling og lønfil. */
export const LOENFIL_CVR = "25340604";

export type BonusTal = { db_bonus: number; samlet_bonus: number };

/** Grundbeløb pr. lønart før reguleringer. Fast provision → alt på 1561. */
export function loenartGrundlag(b: BonusTal, flatrate: number | null): { l1561: number; l1563: number } {
  if (flatrate != null) return { l1561: b.samlet_bonus, l1563: 0 };
  return { l1561: b.db_bonus, l1563: Math.round((b.samlet_bonus - b.db_bonus) * 100) / 100 };
}

/** "2026-09" → "01-10-2026" (første dag i måneden efter bonusmåneden). */
export function loenfilDato(maaned: string): string {
  const y = Number(maaned.slice(0, 4));
  const m = Number(maaned.slice(5, 7));
  const ny = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `01-${String(ny.m).padStart(2, "0")}-${ny.y}`;
}

export type LoenfilRaekke = {
  CVR: string; Name: string; "Employee Number": string; Date: string;
  "Project ID": string; "Type ID": number; Number: number; Amount: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function loenfilRaekker(
  maaned: string,
  saelgere: { loennr: string | null; loen_1561: number; loen_1563: number }[],
): LoenfilRaekke[] {
  const date = loenfilDato(maaned);
  return saelgere.flatMap((s) => [
    { CVR: LOENFIL_CVR, Name: "Provision 1", "Employee Number": s.loennr ?? "", Date: date, "Project ID": "", "Type ID": 1561, Number: 1, Amount: r2(s.loen_1561) },
    { CVR: LOENFIL_CVR, Name: "Provision 2", "Employee Number": s.loennr ?? "", Date: date, "Project ID": "", "Type ID": 1563, Number: 1, Amount: r2(s.loen_1563) },
  ]);
}

/** Måneden er låst før den 10. i måneden efter → advar om sene fakturaer. */
export function tidligLaasning(maaned: string, idag = new Date()): boolean {
  const y = Number(maaned.slice(0, 4));
  const m0 = Number(maaned.slice(5, 7)) - 1;
  return idag.getTime() < Date.UTC(y, m0 + 1, 10);
}
