/** Admin-only opdeling af Forhandlingskunder i KPG3 45 (off. aftalekunder) og private. Ren præsentation. */
export const KPG45_LABEL = "↳ heraf off. aftalekunder (KPG3 45)";
export const PRIVATE_LABEL = "↳ heraf private";
export type Kpg45Raekke = { label: string; kategori: "privat_45" | "privat_ovrige"; per: Map<string, number>; under: true };

/** Bygger de to underrækker ud fra RPC-rækker (maaned, kategori, vaerdi/db). */
export function kpg45Raekker(
  data: { maaned: string | null; kategori: string; vaerdi: number; db?: number | null }[],
  felt: "vaerdi" | "db" = "vaerdi",
): Kpg45Raekke[] {
  const mk = (kategori: "privat_45" | "privat_ovrige", label: string): Kpg45Raekke => {
    const per = new Map<string, number>();
    data.filter((r) => r.kategori === kategori && r.maaned).forEach((r) => {
      const m = String(r.maaned).slice(0, 7);
      per.set(m, (per.get(m) ?? 0) + Number(r[felt] || 0));
    });
    return { label, kategori, per, under: true };
  };
  return [mk("privat_45", KPG45_LABEL), mk("privat_ovrige", PRIVATE_LABEL)];
}

/** Underkategori → den rigtige kategori i detalje-RPC'erne. */
export function hovedKategori(k: string): string {
  return k.startsWith("privat_") ? "privat" : k;
}

/** Filtrerer detaljerækker til underkategorien. Nye kunder vurderes på gruppens første konto (som i SQL). */
export function filtrerUnderkategori<T extends { company_id: string; gruppe_key?: string | null; oprettet?: string | null }>(
  rows: T[], kategori: string, ids45: Set<string>, grupperet: boolean,
): T[] {
  if (!kategori.startsWith("privat_")) return rows;
  const vil45 = kategori === "privat_45";
  if (!grupperet) return rows.filter((r) => ids45.has(r.company_id) === vil45);
  const rep = new Map<string, T>();
  rows.forEach((r) => {
    const k = String(r.gruppe_key ?? r.company_id);
    const cur = rep.get(k);
    const key = (x: T) => `${x.oprettet ?? "9999"}|${x.company_id}`;
    if (!cur || key(r) < key(cur)) rep.set(k, r);
  });
  return rows.filter((r) => ids45.has(rep.get(String(r.gruppe_key ?? r.company_id))!.company_id) === vil45);
}

export const kpg45Noegle = (brugerId: string) => `maalepunkter-kpg45:${brugerId}`;
