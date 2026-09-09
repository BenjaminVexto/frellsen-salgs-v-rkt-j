// Mapping fra Visma "Kundeprisgruppe 3" (customer_segment_3) til:
//  - binding_status: forretningsmæssig binding (offentlig aftale / frit salg / intern)
//  - customer_category: ren kategori uden talkode (fx "HoReCa (Hotel, Rest. og Café)")
//
// Rå værdier ser typisk sådan ud: "40 [Offentlige Udbudskunder]".
//
// VIGTIGT: både binding og kategori udledes UDELUKKENDE af KODEN — kategoriteksten
// i Visma er ikke konsekvent. Kode 40 er udbudsbunden (offentlig), kode 5 er intern,
// alt andet står frit og regnes som privat — også kode 45 (T-SKI m.fl.).

export type BindingStatus = "offentlig_aftale" | "frit_salg" | "intern_privat";

/** Kundetype til opdeling i offentlig/privat. Skal matche public.kundetype() i databasen. */
export type Kundetype = "offentlig" | "privat" | "intern";

export const BINDING_BY_CODE: Record<string, BindingStatus> = {
  "40": "offentlig_aftale",
  "5": "intern_privat",
  "10": "intern_privat",
};

export const CATEGORY_BY_CODE: Record<string, string> = {
  "5": "Interne",
  "10": "Personaleforeninger, kaffeklubber, privatkøb",
  "15": "Kantinefirmaer",
  "20": "HoReCa (Hotel, Rest. og Café)",
  "25": "Firma Kunder (Almindelige)",
  "30": "Koncern og Kædeaftaler",
  "35": "Indkøbsforeninger",
  "40": "Offentlige Udbudskunder",
  "45": "Offentlige aftale kunder",
  "50": "Grossister, bagere og andet videresalg",
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
  // Java Brænderiet/Høyberg udfylder ikke Kundeprisgruppe 3 — Visma sender "0"/"00"
  if (/^0+$/.test(s)) return { code: null, category: null };
  const m = s.match(/^\s*(\d+)\s*\[\s*(.+?)\s*\]\s*$/);
  if (m) return { code: String(Number(m[1])), category: m[2] };
  // Også acceptér "[Kategori]" eller bare "Kategori"
  const m2 = s.match(/^\s*\[\s*(.+?)\s*\]\s*$/);
  if (m2) return { code: null, category: m2[1] };
  return { code: null, category: s };
}

/** Eneste kilde til opdelingen offentlig/privat i frontenden. */
export function deriveKundetype(raw: string | null | undefined): Kundetype {
  const { code } = parseSegment3(raw);
  if (code === "40") return "offentlig";
  if (code === "5") return "intern";
  return "privat";
}

export function deriveBindingStatus(
  raw: string | null | undefined,
): BindingStatus | null {
  const { code } = parseSegment3(raw);
  if (!code) return null;
  return BINDING_BY_CODE[code] ?? "frit_salg";
}

export function deriveCustomerCategory(
  raw: string | null | undefined,
): string | null {
  const { code, category } = parseSegment3(raw);
  if (code && CATEGORY_BY_CODE[code]) return CATEGORY_BY_CODE[code];
  return category;
}
