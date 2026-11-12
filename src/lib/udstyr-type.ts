// Ejerskab/udstyrstype for Wittenborg-serviceregistret (m/ og u/serviceaftale).
// Regel: Midlertidigt udlån (reservedele-felt) → Lejeaftale kode 4 m/ eller u/ binding → ellers kundeejet.
export type UdstyrType = "udlaan" | "leje_ub" | "leje_binding" | "kunde_ejet" | "ukendt";

const udfyldt = (v: string | null | undefined) => (v ?? "").trim() !== "";

export function classifyWittenborg(r: {
  aftale_type?: string | null;
  binding_ophor?: string | null;
  reservedele?: string | null;
}): UdstyrType {
  if ((r.reservedele ?? "").trim().toLowerCase().startsWith("midlertidig udl")) return "udlaan";
  const at = (r.aftale_type ?? "").trim().toLowerCase();
  if (/^4\s*\[lejeaftale/.test(at)) return udfyldt(r.binding_ophor) ? "leje_binding" : "leje_ub";
  return "kunde_ejet";
}
