// Ejerskab/udstyrstype for Wittenborg-serviceregistret (m/ og u/serviceaftale).
// Regel: Midlertidigt udlån ("Reserved. efter regn." eller reservedele) → Lejeaftale kode 2/4 m/ eller u/ binding → ellers kundeejet.
export type UdstyrType = "udlaan" | "leje_ub" | "leje_binding" | "kunde_ejet" | "ukendt";

const udfyldt = (v: string | null | undefined) => (v ?? "").trim() !== "";

export function classifyWittenborg(r: {
  aftale_type?: string | null;
  binding_ophor?: string | null;
  reservedele?: string | null;
  reservedele_efter_raw?: string | null;
}): UdstyrType {
  const udl = (v?: string | null) => (v ?? "").trim().toLowerCase().startsWith("midlertidig udl");
  if (udl(r.reservedele_efter_raw) || udl(r.reservedele)) return "udlaan";
  const at = (r.aftale_type ?? "").trim().toLowerCase();
  if (/^[24]\s*\[lejeaftale/.test(at)) return udfyldt(r.binding_ophor) ? "leje_binding" : "leje_ub";
  return "kunde_ejet";
}
