import { format } from "date-fns";
import { da } from "date-fns/locale";

/**
 * Ringeliste-mærkat på virksomheder — udledt af den nyeste contact_list_assignment.
 * Ingen manuelle felter; mærkatet følger listen uanset hvem der ringer.
 */

export type RingelisteInfo = {
  status: string;
  /** updated_at på den nyeste tildeling */
  dato: string | null;
  listeNavn: string | null;
  ringere: string[];
};

export type RingelisteMaerke = {
  tekst: string;
  /** Gråt mærkat (ikke interesseret) */
  graa: boolean;
  /** "Booket via ringeliste" */
  booket: boolean;
  /** Tæller i filteret "På ringeliste" (ikke ringet / ring igen) */
  aktiv: boolean;
  tooltip: string;
};

export function udledRingelisteMaerke(info: RingelisteInfo): RingelisteMaerke | null {
  const dato = info.dato ? format(new Date(info.dato), "d. MMM", { locale: da }) : null;
  const tooltip = [info.listeNavn, info.ringere.join(", ")].filter(Boolean).join(" · ");
  switch (info.status) {
    case "ny":
    case "skal_kontaktes":
      return { tekst: "Ringeliste · Ikke ringet", graa: false, booket: false, aktiv: true, tooltip };
    case "ring_igen":
      return { tekst: `Ringeliste · Ring igen${dato ? ` ${dato}` : ""}`, graa: false, booket: false, aktiv: true, tooltip };
    case "ikke_interesseret":
      return { tekst: `Ringeliste · Ikke interesseret${dato ? ` ${dato}` : ""}`, graa: true, booket: false, aktiv: false, tooltip };
    case "moede_booket":
      return { tekst: "Booket via ringeliste", graa: false, booket: true, aktiv: false, tooltip };
    default:
      return null;
  }
}

type AssignmentRow = {
  company_id: string;
  status: string;
  updated_at: string;
  contact_list_id: string;
};

/** Vælger nyeste tildeling pr. virksomhed og slår listenavn + ringere op. */
export function bygRingelisteMap(
  assignments: AssignmentRow[],
  listeNavne: Map<string, string>,
  ringerePrListe: Map<string, string[]>,
): Map<string, RingelisteInfo> {
  const map = new Map<string, RingelisteInfo>();
  for (const a of assignments) {
    const cur = map.get(a.company_id);
    if (cur && cur.dato && a.updated_at <= cur.dato) continue;
    map.set(a.company_id, {
      status: a.status,
      dato: a.updated_at,
      listeNavn: listeNavne.get(a.contact_list_id) ?? null,
      ringere: ringerePrListe.get(a.contact_list_id) ?? [],
    });
  }
  return map;
}

/**
 * Henter ringeliste-information. Uden companyIds hentes ALLE tildelinger (listevisning);
 * med companyIds kun for de pågældende virksomheder (firmaside / aktivitetsdialog).
 */
export async function hentRingelisteMap(
  supabase: any,
  companyIds?: string[],
): Promise<Map<string, RingelisteInfo>> {
  // Tildelinger
  const assignments: AssignmentRow[] = [];
  if (companyIds) {
    for (let i = 0; i < companyIds.length; i += 200) {
      const { data } = await supabase
        .from("contact_list_assignments")
        .select("company_id, status, updated_at, contact_list_id")
        .in("company_id", companyIds.slice(i, i + 200));
      assignments.push(...((data ?? []) as AssignmentRow[]));
    }
  } else {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("contact_list_assignments")
        .select("company_id, status, updated_at, contact_list_id")
        .order("id")
        .range(from, from + 999);
      assignments.push(...((data ?? []) as AssignmentRow[]));
      if (!data || data.length < 1000) break;
    }
  }
  if (!assignments.length) return new Map();

  // Listenavne
  const listeIds = [...new Set(assignments.map((a) => a.contact_list_id))];
  const listeNavne = new Map<string, string>();
  for (let i = 0; i < listeIds.length; i += 200) {
    const { data } = await supabase
      .from("contact_lists")
      .select("id, name")
      .in("id", listeIds.slice(i, i + 200));
    (data ?? []).forEach((l: any) => listeNavne.set(l.id, l.name));
  }

  // Ringere pr. liste → navne fra profiles
  const ringerePrListe = new Map<string, string[]>();
  const ringerRows: { contact_list_id: string; user_id: string }[] = [];
  for (let i = 0; i < listeIds.length; i += 200) {
    const { data } = await supabase
      .from("kontaktliste_ringer")
      .select("contact_list_id, user_id")
      .in("contact_list_id", listeIds.slice(i, i + 200));
    ringerRows.push(...(data ?? []));
  }
  const userIds = [...new Set(ringerRows.map((r) => r.user_id))];
  const navne = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds.slice(i, i + 200));
    (data ?? []).forEach((p: any) => p.full_name && navne.set(p.id, p.full_name));
  }
  for (const r of ringerRows) {
    const n = navne.get(r.user_id);
    if (!n) continue;
    const arr = ringerePrListe.get(r.contact_list_id) ?? [];
    if (!arr.includes(n)) arr.push(n);
    ringerePrListe.set(r.contact_list_id, arr);
  }

  return bygRingelisteMap(assignments, listeNavne, ringerePrListe);
}
