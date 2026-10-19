import { describe, expect, it } from "vitest";
import { afstandTilTop } from "./bonus-rangliste";
describe("distance to competition leaders", () => {
  const rows = [
    { saelger: "a", navn: "A", db: 5247, rang: 1, beloeb: 1000 },
    { saelger: "b", navn: "B", db: 5000, rang: 2, beloeb: 600 },
    { saelger: "c", navn: "C", db: 4441, rang: 3, beloeb: 0 },
  ];
  it("shows concrete DB gaps to first and second place", () => {
    expect(afstandTilTop(rows, "c")).toEqual([{ rang: 1, afstand: 806 }, { rang: 2, afstand: 559 }]);
  });
  it("does not present a gap to a place already held or beaten", () => {
    expect(afstandTilTop(rows, "a")).toEqual([]);
  });
  it("preserves shared first place", () => {
    expect(afstandTilTop([...rows, { ...rows[0], saelger: "d" }], "d")).toEqual([]);
  });
});