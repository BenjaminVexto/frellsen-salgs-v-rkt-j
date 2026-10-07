/**
 * DB-udledning fra Vismas summeringslinjer i fakturajournalen.
 *
 * Visma eksporterer DB "0" på linjer uden kostpris (især leje 16/80), men
 * regner dem selv som 100 % DB i kundens summeringslinje. Der må IKKE være en
 * generel regel om DB 0 = 100 % (fx maskinsalg 16/78 har reelt DB 0). Derfor
 * afstemmes pr. kunde mod summeringslinjen:
 *   rest = summeringens DB − sum(linje-DB); kandidater = DB 0 og beløb ≠ 0.
 *   1) rest ≈ sum(kandidaters beløb) → alle kandidater DB = beløb
 *   2) rest ≈ 0 → kandidater beholder DB 0
 *   3) rest ≈ sum(kandidater med varegruppe 2 = 80) → kun de får DB = beløb
 *   4) ellers uafklaret, ingen ændring
 */
export const DB_TOLERANCE = 1;

export type DbKilde = "linje" | "udledt_subtotal" | "uafklaret";
export type DbUdfald = "uaendret" | "udledt" | "udledt_80" | "db0_korrekt" | "uafklaret";

export type UdledLinje = { beloeb: number | null; db: number | null; varegruppe_1?: string | null; varegruppe_2: string | null; db_kilde?: DbKilde };

const near = (a: number, b: number) => Math.abs(a - b) <= DB_TOLERANCE;

/** Muterer linjernes db/db_kilde og returnerer udfaldet for kunden. */
export function udledKundeDb(linjer: UdledLinje[], summeringDb: number): DbUdfald {
  for (const l of linjer) l.db_kilde = "linje";
  const linjeDb = linjer.reduce((s, l) => s + (l.db ?? 0), 0);
  const rest = summeringDb - linjeDb;
  const kand = linjer.filter((l) => (l.db ?? 0) === 0 && (l.beloeb ?? 0) !== 0);
  const sum = (ls: UdledLinje[]) => ls.reduce((s, l) => s + (l.beloeb ?? 0), 0);
  const saet = (ls: UdledLinje[]) => {
    for (const l of ls) {
      l.db = l.beloeb ?? 0;
      l.db_kilde = "udledt_subtotal";
    }
  };
  if (kand.length && near(rest, sum(kand))) {
    saet(kand);
    return "udledt";
  }
  if (near(rest, 0)) return kand.length ? "db0_korrekt" : "uaendret";
  const k80 = kand.filter((l) => (l.varegruppe_2 ?? "").trim() === "80");
  if (k80.length && near(rest, sum(k80))) {
    saet(k80);
    return "udledt_80";
  }
  for (const l of linjer) l.db_kilde = "uafklaret";
  return "uafklaret";
}
