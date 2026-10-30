/** Offentlige adresser til materialefiler; bucket'en er privat, så filer serveres via /m/$id/$fil. */
export const MATERIALE_BASE = "https://frellsen.lovable.app";

export function materialeFilUrl(id: string, fil: "forside" | "pdf", version?: string | null) {
  return `${MATERIALE_BASE}/m/${id}/${fil}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}

/** Migrerede materialer har et fuldt billedlink; uploadede har en sti i bucket'en. */
export function materialeForsideUrl(m: { id: string; forside_billede_path: string | null; opdateret_at?: string | null }) {
  if (!m.forside_billede_path) return null;
  if (/^https?:\/\//.test(m.forside_billede_path)) return m.forside_billede_path;
  return materialeFilUrl(m.id, "forside", m.opdateret_at);
}

export function materialeKilde(m: { id: string; type: string; url: string | null }) {
  return m.type === "pdf" ? materialeFilUrl(m.id, "pdf") : m.url;
}

/** Ved ét valg bruges materialets tekst, ved flere en fælles tekst. */
export function standardMailtekst(valgte: { mailtekst: string }[]) {
  if (valgte.length === 1) return valgte[0].mailtekst || "Her er materialet, som aftalt.";
  return "Her er materialerne, som aftalt.";
}
