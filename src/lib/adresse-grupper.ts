/**
 * Samme normalisering som databasens addr_n_vej/addr_n_husnr:
 * vejnavn + husnr (+bogstav); etage, side, sal og tekst efter komma ignoreres.
 */
export function adresseNoegle(a: string | null | undefined): string | null {
  if (!a || !a.trim()) return null;
  const s = a
    .toLowerCase()
    .replace(/[éè]/g, "e")
    .split(",")[0]!
    .replace(/\s+/g, " ")
    .trim()
    .replace(/v\.(\s|$)/g, "vej$1");
  const m = s.match(/^([^0-9]*[^0-9\s])\s*([0-9]+)\s*([a-zæøå]?)(?:[^a-zæøå]|$)/);
  if (!m) return s || null;
  return `${m[1]!.replace(/[.\s]+$/, "")}|${m[2]}${m[3] ?? ""}`;
}

export type LokLite = {
  id: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  visma_delivery_no: string | null;
  is_primary?: boolean | null;
  saelger_user_id?: string | null;
  customer_type?: string | null;
};

export type AdresseValg = {
  key: string;
  label: string;
  /** Kontoen aktiviteten gemmes på: primær konto på adressen, ellers første aktive, ellers første. */
  kontoId: string;
  locIds: string[];
  egen: boolean;
};

/** Én række pr. adresse (postnr. + normaliseret vej/husnr.), brugerens egne øverst. */
export function adresseValg(locs: LokLite[], userId?: string | null): AdresseValg[] {
  const map = new Map<string, LokLite[]>();
  for (const l of locs) {
    const nk = adresseNoegle(l.address);
    const key = nk ? `${l.zip ?? ""}|${nk}` : `id:${l.id}`;
    const arr = map.get(key) ?? [];
    arr.push(l);
    map.set(key, arr);
  }
  const out: AdresseValg[] = [];
  for (const [key, arr] of map) {
    const konto =
      arr.find((l) => l.is_primary) ??
      arr.find((l) => l.customer_type === "aktiv_kunde") ??
      arr[0]!;
    const nr = arr.map((l) => l.visma_delivery_no).filter(Boolean) as string[];
    const adr = [konto.address, [konto.zip, konto.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    out.push({
      key,
      label: `${adr || "Uden adresse"}${nr.length ? ` (kundenr. ${nr.join(", ")})` : ""}`,
      kontoId: konto.id,
      locIds: arr.map((l) => l.id),
      egen: !!userId && arr.some((l) => l.saelger_user_id === userId),
    });
  }
  return out.sort((a, b) => Number(b.egen) - Number(a.egen) || a.label.localeCompare(b.label, "da"));
}

/** Adressetekst for en lokation (til aktivitetslisten). */
export function lokAdresse(l: LokLite | null | undefined): string | null {
  if (!l) return null;
  const s = [l.address, [l.zip, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return s || null;
}

export const MAKS_DAGE_TILBAGE = 14;

/** Er valgt aktivitetstid tilladt: højst 14 dage tilbage, ikke i fremtiden. */
export function gyldigAktivitetsTid(d: Date, nu: Date = new Date()): boolean {
  if (Number.isNaN(d.getTime())) return false;
  if (d.getTime() > nu.getTime() + 60_000) return false;
  return d.getTime() >= nu.getTime() - MAKS_DAGE_TILBAGE * 86400000;
}

/** "YYYY-MM-DDTHH:mm" i lokal tid til <input type="datetime-local">. */
export function tilLokalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
