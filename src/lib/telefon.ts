/** Formaterer danske 8-cifrede numre som "12 34 56 78" (evt. med +45). Andet vises uændret. */
export function formatTelefon(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let d = s.replace(/[^\d+]/g, "");
  let prefix = "";
  if (d.startsWith("+45")) { prefix = "+45 "; d = d.slice(3); }
  else if (d.startsWith("0045")) { prefix = "+45 "; d = d.slice(4); }
  if (/^\d{8}$/.test(d)) return prefix + d.replace(/(\d{2})(?=\d)/g, "$1 ");
  return s;
}

/** Værdi til tel:-link (kun cifre og +). */
export function telHref(raw: string | null | undefined): string {
  return "tel:" + String(raw ?? "").replace(/[^\d+]/g, "");
}

/** Hjemmeside som klikbar URL. */
export function webHref(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Lokationens nummer vises først, hvis det afviger fra virksomhedens. */
export function telefonNumre(lokation: string | null | undefined, virksomhed: string | null | undefined): string[] {
  const norm = (x: string | null | undefined) => String(x ?? "").replace(/\D/g, "").replace(/^45(?=\d{8}$)/, "");
  const ud: string[] = [];
  if (lokation && norm(lokation)) ud.push(lokation);
  if (virksomhed && norm(virksomhed) && norm(virksomhed) !== norm(lokation)) ud.push(virksomhed);
  return ud;
}
