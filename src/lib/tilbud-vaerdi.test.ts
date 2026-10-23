import { describe, it, expect } from "vitest";
import { beregnAarsvaerdi } from "./tilbud-vaerdi";

describe("beregnAarsvaerdi", () => {
  it("er (forbrug + faste) × 12", () => {
    expect(beregnAarsvaerdi(2500, 500)).toBe(36000);
  });
  it("faste kan være 0", () => {
    expect(beregnAarsvaerdi(1000, 0)).toBe(12000);
  });
});
