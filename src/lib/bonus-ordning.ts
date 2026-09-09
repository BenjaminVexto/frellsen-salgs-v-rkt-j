/** Bonusordning — satser med gyldighedsperiode, så historikken ikke flytter sig. */
export type BonusOrdning = {
  id: string;
  user_id: string;
  gyldig_fra: string;
  gyldig_til: string | null;
  db_provision_pct: number;
  db_privat: boolean;
  db_offentlig: boolean;
  bonus_wittenborg: number;
  bonus_animo: number;
  bonus_rex: number;
  maskin_privat: boolean;
  maskin_offentlig: boolean;
  maskin_salg: boolean;
  maskin_leje: boolean;
  maskin_brugt: boolean;
  /** Bund/top pr. måned — null = ingen grænse. */
  db_bund: number | null;
  db_top: number | null;
  maskin_bund: number | null;
  maskin_top: number | null;
  total_bund: number | null;
  total_top: number | null;
  /** Fast beløb pr. måned der erstatter al anden bonus. */
  flatrate: number | null;
  created_at?: string;
  created_by?: string | null;
};


const MDR_LANG = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

export const langDato = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${Number(day)}. ${MDR_LANG[Number(m) - 1]} ${y}`;
};

const tal = (n: number, dec = 0) =>
  Number(n).toLocaleString("da-DK", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Én linje der beskriver ordningen i klart sprog. */
export function beskrivOrdning(o: BonusOrdning): string {
  const periode = o.gyldig_til
    ? `Gældende ${langDato(o.gyldig_fra)}–${langDato(o.gyldig_til)}`
    : `Gældende fra ${langDato(o.gyldig_fra)}`;

  const dbKunder: string[] = [];
  if (o.db_privat) dbKunder.push("private");
  if (o.db_offentlig) dbKunder.push("offentlige");
  const dbDel =
    Number(o.db_provision_pct) > 0 && dbKunder.length > 0
      ? `${tal(o.db_provision_pct, 1)} % af DB på ${dbKunder.join(" og ")} kunder`
      : "ingen DB-provision";

  const satser: string[] = [];
  const w = Number(o.bonus_wittenborg);
  const a = Number(o.bonus_animo);
  const r = Number(o.bonus_rex);
  if (w > 0 && w === a) satser.push(`${tal(w)} kr. pr. Wittenborg og Animo`);
  else {
    if (w > 0) satser.push(`${tal(w)} kr. pr. Wittenborg`);
    if (a > 0) satser.push(`${tal(a)} kr. pr. Animo`);
  }
  if (r > 0) satser.push(`${tal(r)} kr. pr. Rex-Royal`);

  const maskinKunder: string[] = [];
  if (o.maskin_privat) maskinKunder.push("private");
  if (o.maskin_offentlig) maskinKunder.push("offentlige");
  const typer: string[] = [];
  if (o.maskin_salg) typer.push("salg");
  if (o.maskin_leje) typer.push("leje/udlån");
  const vilkaar =
    satser.length > 0
      ? ` (${maskinKunder.join(" og ")} kunder, ${typer.join(" og ")}${o.maskin_brugt ? ", brugte tæller med" : ", kun nye"})`
      : "";

  return `${periode}: ${dbDel}${satser.length ? " · " + satser.join(" · ") + vilkaar : ""}`;
}
