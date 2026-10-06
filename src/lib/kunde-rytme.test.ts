import { describe, expect, it } from "vitest";
import { rytmeGraenseMdr, rytmeTekst } from "./kunde-rytme";

describe("købsrytme", () => {
  it("uden etableret rytme (under 3 købsmåneder) er grænsen 3 mdr", () => {
    expect(rytmeGraenseMdr(2, 5)).toBe(3);
  });
  it("kunde der køber hver 4. måned er aktiv op til 6 mdr", () => {
    expect(rytmeGraenseMdr(5, 4)).toBe(6);
  });
  it("hyppig køber falder tilbage til 3 mdr", () => {
    expect(rytmeGraenseMdr(12, 1)).toBe(3);
  });
  it("viser forventet næste køb", () => {
    expect(
      rytmeTekst({ koebsmaaneder: 5, intervalMdr: 4.2, naesteForventet: "2026-12-10", overRytme: false, aktiv: true }),
    ).toBe("Køber typisk hver ~4. måned · næste køb forventet ca. december 2026");
  });
  it("over rytmen men stadig aktiv", () => {
    expect(
      rytmeTekst({ koebsmaaneder: 5, intervalMdr: 4, naesteForventet: "2026-08-01", overRytme: true, aktiv: true }),
    ).toBe("Køber typisk hver ~4. måned · Forventet køb er overskredet");
  });
  it("månedlige købere får ingen linje", () => {
    expect(rytmeTekst({ koebsmaaneder: 12, intervalMdr: 1.2, naesteForventet: "2026-11-01", overRytme: true, aktiv: true })).toBeNull();
  });
});
