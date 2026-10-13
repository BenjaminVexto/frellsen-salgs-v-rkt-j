import { describe, expect, it } from "vitest";
import { formatTelefon, telefonNumre } from "./telefon";

describe("telefon", () => {
  it("formaterer 8 cifre som 12 34 56 78", () => {
    expect(formatTelefon("12345678")).toBe("12 34 56 78");
    expect(formatTelefon("+4512345678")).toBe("+45 12 34 56 78");
  });
  it("viser lokationens nummer først, når det afviger", () => {
    expect(telefonNumre("87654321", "12345678")).toEqual(["87654321", "12345678"]);
  });
  it("viser kun ét nummer, når lokation og virksomhed har samme", () => {
    expect(telefonNumre("+45 12 34 56 78", "12345678")).toEqual(["+45 12 34 56 78"]);
  });
});
