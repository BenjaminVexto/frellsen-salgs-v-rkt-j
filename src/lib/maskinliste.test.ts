import { describe, expect, it } from "vitest";
import { aftaleLabel, sorterMaskiner, udloeberSnart, type MaskinRaekke } from "./maskinliste";

const r = (maskintype: string, udloeber: string | null): MaskinRaekke => ({
  maskintype, serienr: "", placering: "", aftale: "", udloeber, kopper: null, aflaest: null, service: false,
});

describe("maskinliste", () => {
  it("markerer maskiner der udløber inden for 6 måneder", () => {
    const idag = new Date("2026-10-06T12:00:00");
    expect(udloeberSnart("2027-03-31", idag)).toBe(true);
    expect(udloeberSnart("2027-05-01", idag)).toBe(false);
  });
  it("sorterer først udløbende øverst, uden dato sidst", () => {
    const s = sorterMaskiner([r("C", null), r("B", "2028-01-01"), r("A", "2027-01-01")]);
    expect(s.map((x) => x.maskintype)).toEqual(["A", "B", "C"]);
  });
  it("gratis udlån vinder over aftaletype", () => {
    expect(aftaleLabel("Leje", true)).toBe("Gratis udlån");
    expect(aftaleLabel("Leasing", false)).toBe("Lease");
  });
});
describe("aftaleLabel Visma-kode", () => {
  it("viser teksten i parentesen", () => expect(aftaleLabel("1 [Serviceaftale]", false)).toBe("Serviceaftale"));
});

import { samletAftale, maskinNavn, aeldreAflaesning } from "./maskinliste";
describe("samletAftale", () => {
  it("leje + service", () => expect(samletAftale("5 [Leje u/b]", "1 [Serviceaftale]", false)).toBe("Leje + serviceaftale"));
  it("kun service", () => expect(samletAftale(null, "1 [Serviceaftale]", false)).toBe("Serviceaftale"));
  it("udlån", () => expect(samletAftale(null, null, true)).toBe("Udlån"));
  it("intet", () => expect(samletAftale(null, null, false)).toBe("—"));
  it("mærke", () => expect(maskinNavn("9100 R&G/B2C")).toBe("Wittenborg 9100 R&G/B2C"));
  it("ældre aflæsning", () => {
    const idag = new Date("2026-10-06T00:00:00");
    expect(aeldreAflaesning("2025-09-30", idag)).toBe(true);
    expect(aeldreAflaesning("2025-11-01", idag)).toBe(false);
  });
});
