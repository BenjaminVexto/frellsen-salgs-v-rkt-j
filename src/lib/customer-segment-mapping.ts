// Mapping fra Visma "Kundeprisgruppe 3" (customer_segment_3) til:
//  - binding_status: forretningsmæssig binding (offentlig aftale / frit salg / intern)
//  - customer_category: ren kategori uden talkode (fx "HoReCa (Hotel, Rest. og Café)")
//
// Rå værdier ser typisk sådan ud: "40 [Offentlige Udbudskunder]".
// Mapping er én kilde og let at udvide — tilføj nye kategorier i BINDING_BY_CATEGORY.

export type BindingStatus = "offentlig_aftale" | "frit_salg" | "intern_privat";

export const BINDING_BY_CATEGORY: Record<string, BindingStatus> = {
  "Offentlige Udbudskunder": "offentlig_aftale",
  "Offentlige aftale kunder": "offentlig_aftale",

  "Firma Kunder (Almindelige)": "frit_salg",
  "Kantinefirmaer": "frit_salg",
  "HoReCa (Hotel, Rest. og Café)": "frit_salg",
  "Indkøbsforeninger": "frit_salg",
  "Koncern og Kædeaftaler": "frit_salg",
  "Grossister, bagere og andet videresalg": "frit_salg",

  "Interne": "intern_privat",
  "Personaleforeninger, kaffeklubber, privatkøb": "intern_privat",
};

export const BINDING_LABEL: Record<BindingStatus, string> = {
  offentlig_aftale: "Offentlig aftale",
  frit_salg: "Frit salg",
  intern_privat: "Intern / privat",
};

/**
 * Parser fx "40 [Offentlige Udbudskunder]" → { code: "40", category: "Offentlige Udbudskunder" }
 * Returnerer { code: null, category: trimmed } hvis der ikke er nogen kode/kantet parentes.
 */
export function parseSegment3(
  raw: string | null | undefined,
): { code: string | null; category: string | null } {
  if (!raw) return { code: null, category: null };
  const s = String(raw).trim();
  if (!s) return { code: null, category: null };
  const m = s.match(/^\s*(\d+)\s*\[\s*(.+?)\s*\]\s*$/);
  if (m) return { code: m[1], category: m[2] };
  // Også acceptér "[Kategori]" eller bare "Kategori"
  const m2 = s.match(/^\s*\[\s*(.+?)\s*\]\s*$/);
  if (m2) return { code: null, category: m2[1] };
  return { code: null, category: s };
}

export function deriveBindingStatus(
  raw: string | null | undefined,
): BindingStatus | null {
  const { category } = parseSegment3(raw);
  if (!category) return null;
  return BINDING_BY_CATEGORY[category] ?? null;
}

export function deriveCustomerCategory(
  raw: string | null | undefined,
): string | null {
  const { category } = parseSegment3(raw);
  return category;
}
