import type { CompanyRow, LocationLite } from "./types";
import type { ListeItem } from "@/components/cvr-gruppe";

export function soegeord(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
}

/** Del feltet ved alle andre tegn end Unicode-bogstaver og tal. */
export function tekstMatcherOrd(value: string | null | undefined, word: string): boolean {
  const text = (value ?? "").toLowerCase();
  let start = text.indexOf(word);
  while (start !== -1) {
    const before = Array.from(text.slice(0, start)).at(-1);
    if (!before || !/[\p{L}\p{N}]/u.test(before)) return true;
    start = text.indexOf(word, start + 1);
  }
  return false;
}

const talMatcherOrd = (value: string | null | undefined, word: string) =>
  (value ?? "").toLowerCase().includes(word);

export function lokationMatcherOrd(l: LocationLite, word: string): boolean {
  return [l.address, l.city, ...(l.penhed_navne ?? [])].some((v) => tekstMatcherOrd(v, word)) ||
    [l.zip, l.visma_delivery_no, ...(l.p_numre ?? [])].some((v) => talMatcherOrd(v, word));
}

export function lokationMatcher(l: LocationLite, rawQuery: string): boolean {
  const words = soegeord(rawQuery);
  return words.length > 0 && words.every((word) => lokationMatcherOrd(l, word));
}

export function companyMatcher(
  r: Pick<CompanyRow, "name" | "cvr" | "address" | "city" | "zip" | "visma_id" | "visma_delivery_id"> & { phone?: string | null },
  locations: LocationLite[],
  cvrName: string | null | undefined,
  query: string,
  words = soegeord(query),
): boolean {
  if (!words.length) return true;
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 4 && (r.phone ?? "").replace(/\D/g, "").includes(digits)) return true;
  return words.every((word) =>
    [r.name, cvrName, r.address, r.city].some((v) => tekstMatcherOrd(v, word)) ||
    [r.zip, r.cvr, r.visma_id, r.visma_delivery_id].some((v) => talMatcherOrd(v, word)) ||
    locations.some((l) => lokationMatcherOrd(l, word)),
  );
}

export function matchendeKonti(it: ListeItem): CompanyRow[] {
  if (it.kind === "en") return [it.row];
  return it.tvungen ? it.konti.filter((k) => it.hits.has(k.id)) : it.konti;
}

export function antalMatchendeKonti(items: ListeItem[]): number {
  return items.reduce((sum, it) => sum + matchendeKonti(it).length, 0);
}