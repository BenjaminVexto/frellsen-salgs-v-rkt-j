/** Hovedkategorier i forbrugsgrafen på virksomhedskortet. */
export type HovedkategoriKey = "kaffe" | "te" | "maskiner" | "oevrigt";

export const HOVEDKATEGORIER: {
  key: HovedkategoriKey;
  label: string;
  /** Varegruppe 1-koder. Tom = alle andre koder. */
  koder: string[];
  /** Maskiner og øvrigt registreres ikke i kg. */
  kgMuligt: boolean;
}[] = [
  { key: "kaffe", label: "Kaffe", koder: ["2"], kgMuligt: true },
  { key: "te", label: "Te", koder: ["4"], kgMuligt: true },
  { key: "maskiner", label: "Maskiner", koder: ["16", "17", "18"], kgMuligt: false },
  { key: "oevrigt", label: "Øvrigt", koder: [], kgMuligt: false },
];

const NAVNGIVNE_KODER = new Set(
  HOVEDKATEGORIER.flatMap((h) => h.koder),
);

/** Varegruppekoden ("2 [Kaffe]" -> "2"). */
export function kodeOf(raw: string | null | undefined): string | null {
  return (raw ?? "").trim().match(/^(\d+)/)?.[1] ?? null;
}

/** Hvilken hovedkategori hører en varegruppe 1-kode til? */
export function hovedkategoriAf(raw: string | null | undefined): HovedkategoriKey {
  const kode = kodeOf(raw);
  if (!kode) return "oevrigt";
  const match = HOVEDKATEGORIER.find((h) => h.koder.includes(kode));
  return match ? match.key : NAVNGIVNE_KODER.has(kode) ? "oevrigt" : "oevrigt";
}

export function hovedkategori(key: HovedkategoriKey) {
  return HOVEDKATEGORIER.find((h) => h.key === key)!;
}

/** Underkategorierne har kun betydning for kaffe, te og maskiner. */
export type UnderkategoriPunkt = {
  period: string;
  hovedkategori: HovedkategoriKey;
  label: string;
  sort: number;
  kg: number;
  kr: number;
};
