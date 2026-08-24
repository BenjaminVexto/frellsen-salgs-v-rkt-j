// Ét sted for kundestatus, så kundekort og lister aldrig kan vise forskellige
// svar om samme kunde. Alt regnes på månedsaggregerede salgsrækker.
import {
  currentMonthStart,
  filterByPeriod,
  isConsumableGroup,
  monthsAgo,
  type SalesMonthlyRow,
} from "./sales-utils";

/** Salgshistorikken starter her — der kommer aldrig data længere tilbage. */
export const DATA_FLOOR = "2025-01-01";

/** Sammenligning må kun beregnes, hvis hele år-før-vinduet er dækket af data. */
export function harGyldigtSammenligningsvindue(fraPeriode: string): boolean {
  return fraPeriode >= DATA_FLOOR;
}

/** Fast tekst når et sammenligningsvindue ikke er dækket af data. */
export const SAMMENLIGNING_UTILGAENGELIG_12MDR =
  "Sammenligning tilgængelig fra januar 2027";

export type KundeStatusKode =
  | "stille"
  | "faldende"
  | "for_lidt_historik"
  | "foelger_rytmen";

export type KundeStatusTone = "rod" | "gul" | "neutral";

export type KundeStatus = {
  kode: KundeStatusKode;
  tone: KundeStatusTone;
  overskrift: string;
  /** Dansk prosatekst — aldrig procent. */
  tekst: string;
  ordrer12: number;
  forventetIntervalDage: number | null;
  dageSidenKoeb: number | null;
  sidsteForbrugskoeb: string | null;
};

function dagesSiden(iso: string): number {
  return Math.floor((Date.now() - new Date(iso + "T00:00:00Z").getTime()) / 86400000);
}

function harAktivitet(r: SalesMonthlyRow): boolean {
  return (
    (Number(r.revenue) || 0) > 0 ||
    (Number(r.quantity) || 0) > 0 ||
    (Number(r.order_count) || 0) > 0
  );
}

function sumKg(rows: SalesMonthlyRow[]): number {
  return rows.reduce((s, r) => s + (Number(r.weight_kg) || 0), 0);
}

/** "ca. hver 18. dag" / "ca. hver 3. måned" */
function intervalTekst(dage: number): string {
  if (dage >= 60) {
    const mdr = Math.round(dage / 30);
    return `ca. hver ${mdr}. måned`;
  }
  if (dage >= 21) {
    const uger = Math.round(dage / 7);
    return `ca. hver ${uger}. uge`;
  }
  return `ca. hver ${Math.max(1, Math.round(dage))}. dag`;
}

function datoTekst(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
  });
}

/**
 * Beregner præcis én status pr. virksomhed ud fra månedsaggregerede rækker.
 * Kadence og udvikling måles udelukkende på forbrugsvarer.
 */
export function beregnKundeStatus(rows: SalesMonthlyRow[]): KundeStatus {
  const forbrug = rows.filter((r) => isConsumableGroup(r.product_group_1));

  const nuMdr = currentMonthStart();
  const helt12Fra = monthsAgo(12); // 12 hele måneder, den igangværende måned undtaget
  const helt12 = filterByPeriod(forbrug, helt12Fra, nuMdr);
  const ordrer12 = helt12.reduce((s, r) => s + (Number(r.order_count) || 0), 0);

  const forventetIntervalDage = ordrer12 >= 3 ? 365 / ordrer12 : null;

  let sidsteForbrugskoeb: string | null = null;
  for (const r of forbrug) {
    if (!harAktivitet(r)) continue;
    const d = r.last_invoice_date ?? r.period;
    if (!sidsteForbrugskoeb || d > sidsteForbrugskoeb) sidsteForbrugskoeb = d;
  }
  const dageSidenKoeb = sidsteForbrugskoeb ? dagesSiden(sidsteForbrugskoeb) : null;

  // --- Støjtest: må et fald overhovedet farves? ---
  const kgPrMaaned = new Map<string, number>();
  for (const r of helt12) {
    kgPrMaaned.set(r.period, (kgPrMaaned.get(r.period) ?? 0) + (Number(r.weight_kg) || 0));
  }
  const kg12 = sumKg(helt12);
  const stoersteMaaned = Math.max(0, ...Array.from(kgPrMaaned.values()));
  const sammenligningGyldig = harGyldigtSammenligningsvindue(monthsAgo(18));
  const bestaarStoejtest =
    ordrer12 >= 6 && kg12 > 0 && stoersteMaaned <= kg12 * 0.4 && sammenligningGyldig;

  // --- 6 hele mdr. mod samme 6 mdr. året før (kg forbrugsvarer) ---
  const kgSeneste6 = sumKg(filterByPeriod(forbrug, monthsAgo(6), nuMdr));
  const kgAaretFoer6 = sumKg(filterByPeriod(forbrug, monthsAgo(18), monthsAgo(12)));
  const faldPct =
    kgAaretFoer6 > 0 ? (kgAaretFoer6 - kgSeneste6) / kgAaretFoer6 : null;

  const base = {
    ordrer12,
    forventetIntervalDage,
    dageSidenKoeb,
    sidsteForbrugskoeb,
  };

  const sidsteKoebSaetning = sidsteForbrugskoeb
    ? `Sidste forbrugskøb ${datoTekst(sidsteForbrugskoeb)}.`
    : "Ingen forbrugsvarekøb registreret.";

  // 1. Stille
  const stilleGraense = Math.max((forventetIntervalDage ?? 0) * 2, 45);
  if (dageSidenKoeb != null && dageSidenKoeb > stilleGraense) {
    return {
      ...base,
      kode: "stille",
      tone: "rod",
      overskrift: "Kunden er gået stille",
      tekst: forventetIntervalDage
        ? `Ingen forbrugsvarer købt i ${dageSidenKoeb} dage. Normalt ${intervalTekst(forventetIntervalDage)}.`
        : `Ingen forbrugsvarer købt i ${dageSidenKoeb} dage.`,
    };
  }

  // 2. Faldende
  if (bestaarStoejtest && faldPct != null && faldPct > 0.25) {
    return {
      ...base,
      kode: "faldende",
      tone: "gul",
      overskrift: "Forbruget er faldende",
      tekst: `Kunden aftager tydeligt mindre kaffe og forbrugsvarer end samme halvår sidste år. ${sidsteKoebSaetning}`,
    };
  }

  // 3. For lidt historik
  if (ordrer12 < 4) {
    return {
      ...base,
      kode: "for_lidt_historik",
      tone: "neutral",
      overskrift: "For lidt historik",
      tekst: `Køber for sjældent til at vi kan vurdere en udvikling. ${sidsteKoebSaetning}`,
    };
  }

  // 4. Følger rytmen
  return {
    ...base,
    kode: "foelger_rytmen",
    tone: "neutral",
    overskrift: "Følger sin rytme",
    tekst: forventetIntervalDage
      ? `Bestiller ${intervalTekst(forventetIntervalDage)}. ${sidsteForbrugskoeb ? `Sidste forbrugskøb ${datoTekst(sidsteForbrugskoeb)} — inden for normal rytme.` : ""}`.trim()
      : sidsteKoebSaetning,
  };
}

/**
 * Støjtesten alene: mindst 6 forbrugsordrer seneste 12 hele mdr., ingen enkeltmåned
 * over 40 % af årets kilo, og et dækket sammenligningsvindue. Bruges af signaler,
 * der ellers ville farve en bestillingsrytme som et fald.
 */
export function bestaarStoejtest(rows: SalesMonthlyRow[]): boolean {
  const forbrug = rows.filter((r) => isConsumableGroup(r.product_group_1));
  const helt12 = filterByPeriod(forbrug, monthsAgo(12), currentMonthStart());
  const ordrer12 = helt12.reduce((s, r) => s + (Number(r.order_count) || 0), 0);
  const kgPrMaaned = new Map<string, number>();
  for (const r of helt12) {
    kgPrMaaned.set(r.period, (kgPrMaaned.get(r.period) ?? 0) + (Number(r.weight_kg) || 0));
  }
  const kg12 = sumKg(helt12);
  const stoersteMaaned = Math.max(0, ...Array.from(kgPrMaaned.values()));
  return (
    ordrer12 >= 6 &&
    kg12 > 0 &&
    stoersteMaaned <= kg12 * 0.4 &&
    harGyldigtSammenligningsvindue(monthsAgo(18))
  );
}


/**
 * Samme statusmodel som beregnKundeStatus, men ud fra snapshot-tal
 * (forbrug_signal_*) i stedet for rå salgsrækker. Bruges på arbejdslister,
 * hvor vi ikke må hente alle kunders salgshistorik.
 * Ingen anden kode må definere status på egen hånd.
 */
export function statusFraSignal(input: {
  harFald: boolean;
  dageSidenKoeb: number | null;
  forventetIntervalDage: number | null;
  ordrerNok?: boolean;
}): { kode: KundeStatusKode; tone: KundeStatusTone; label: string } {
  const graense = Math.max((input.forventetIntervalDage ?? 0) * 2, 45);
  if (input.dageSidenKoeb != null && input.dageSidenKoeb > graense) {
    return { kode: "stille", tone: "rod", label: "Gået stille" };
  }
  if (input.harFald && input.ordrerNok !== false) {
    return { kode: "faldende", tone: "gul", label: "Faldende" };
  }
  if (input.ordrerNok === false) {
    return { kode: "for_lidt_historik", tone: "neutral", label: "For lidt historik" };
  }
  return { kode: "foelger_rytmen", tone: "neutral", label: "Følger sin rytme" };
}

/** Dage siden en dato, eller null. */
export function dageSiden(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(String(iso).slice(0, 10) + "T00:00:00Z").getTime()) / 86400000);
}
