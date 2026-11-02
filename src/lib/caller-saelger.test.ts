import { describe, it, expect } from "vitest";
import { saelgerAktiv, matcherSaelgerFilter } from "./caller-saelger";

const nu = new Date("2026-11-02T10:46:00Z");
const a = (type: string, at = "2026-11-01T10:46:00Z") => ({ type, at, bruger: "Sælger" });
describe("callerens sælgerindsats", () => {
  it("medtager præcis de seneste 90 dage, ikke ældre eller fremtidige registreringer", () => {
    const graense = nu.getTime() - 90 * 86400000;
    expect(saelgerAktiv(a("besøg", new Date(graense).toISOString()), nu)).toBe(true);
    expect(saelgerAktiv(a("besøg", new Date(graense - 1).toISOString()), nu)).toBe(false);
    expect(saelgerAktiv(a("besøg", new Date(nu.getTime() + 1).toISOString()), nu)).toBe(false);
  });
  it("besøg, møde, tilbud og konkurrentaftale tæller; almindelige opkald og noter gør ikke", () => {
    for (const type of ["besøg", "møde", "teams_møde", "tilbud_sendt", "konkurrentaftale"]) expect(saelgerAktiv(a(type), nu)).toBe(true);
    for (const type of ["opkald", "intern_note", "email"]) expect(saelgerAktiv(a(type), nu)).toBe(false);
    expect(saelgerAktiv(null, nu)).toBe(false);
  });
  it("kan vise eller fravælge aktive samlet uden at ændre listen eller dens status", () => {
    const rows = [{ status: "ny", aktiv: true }, { status: "ring_igen", aktiv: false }];
    expect(rows.filter(r => matcherSaelgerFilter(r.aktiv, "kun"))).toEqual([{ status: "ny", aktiv: true }]);
    expect(rows.filter(r => matcherSaelgerFilter(r.aktiv, "uden"))).toEqual([{ status: "ring_igen", aktiv: false }]);
    expect(rows.filter(r => matcherSaelgerFilter(r.aktiv, "alle"))).toHaveLength(2);
    expect(rows.map(r => r.status)).toEqual(["ny", "ring_igen"]);
  });
});