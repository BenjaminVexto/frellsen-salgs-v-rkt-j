import { subMonths } from "date-fns";

/** Samme kalendergrænse som databasen; øvrige statusperioder ændres ikke. */
export function indenForAktivperiode(sidsteKoeb: Date, reference: Date): boolean {
  return sidsteKoeb.getTime() >= subMonths(reference, 6).getTime();
}