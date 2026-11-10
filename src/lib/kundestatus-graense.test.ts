import { describe, expect, it } from "vitest";
import { indenForAktivperiode } from "./kundestatus-graense";

describe("seks måneders kundestatusgrænse", () => {
  const ref = new Date("2026-10-31T00:00:00Z");
  it("køb præcis seks kalendermåneder tilbage er aktivt", () => {
    expect(indenForAktivperiode(new Date("2026-04-30T00:00:00Z"), ref)).toBe(true);
  });
  it("køb mere end seks kalendermåneder tilbage er ikke aktivt", () => {
    expect(indenForAktivperiode(new Date("2026-04-29T00:00:00Z"), ref)).toBe(false);
  });
  it("køb for fire måneder siden er stadig aktivt", () => {
    expect(indenForAktivperiode(new Date("2026-06-30T00:00:00Z"), ref)).toBe(true);
  });
});