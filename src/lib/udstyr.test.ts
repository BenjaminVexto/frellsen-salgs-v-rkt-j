import { describe, expect, it } from "vitest";
import { fordelBelastning, STANDARD_SATSER, periode, type GrundMaskine } from "./udstyr";

const mk = (id: string, t: string, u = 3): GrundMaskine => ({ id, sn: id, lev: "1", b: t, t, u, o: null, tl: null, at: null, as: null });

describe("fordeling af maskinbelastning", () => {
  it("faste satser: Brita 44, Bravilor/Bonamat 85, Andet udlån 117 pr. måned", () => {
    const r = fordelBelastning(10_000, [mk("b", "Brita-filtre", 5), mk("g", "Bravilor/Bonamat og bryggere", 4), mk("a", "Andet", 4), mk("w", "Wittenborg")], {}, 12, STANDARD_SATSER);
    const v = Object.fromEntries(r.maskiner.map((m) => [m.id, m.belastning]));
    expect(v.b).toBe(528);
    expect(v.g).toBe(1020);
    expect(v.a).toBe(1404);
    expect(v.w).toBe(10_000 - 528 - 1020 - 1404);
  });
  it("resten fordeles efter lejeandel", () => {
    const r = fordelBelastning(1000, [mk("w", "Wittenborg"), mk("r", "Rex-Royal")], { Wittenborg: 300, "Rex-Royal": 100 }, 12, STANDARD_SATSER);
    expect(r.maskiner.find((m) => m.id === "w")!.belastning).toBe(750);
    expect(r.maskiner.find((m) => m.id === "r")!.belastning).toBe(250);
  });
  it("uden leje fordeles efter antal", () => {
    const r = fordelBelastning(900, [mk("w1", "Wittenborg"), mk("w2", "Wittenborg"), mk("r", "Rex-Royal")], {}, 12, STANDARD_SATSER);
    for (const m of r.maskiner) expect(m.belastning).toBeCloseTo(300);
  });
  it("uden Frellsen-udstyr er belastningen ufordelt", () => {
    const r = fordelBelastning(500, [mk("k", "Wittenborg", 0)], {}, 12, STANDARD_SATSER);
    expect(r.ufordelt).toBe(500);
    expect(r.maskiner).toHaveLength(0);
  });
  it("faste satser skaleres ned, hvis de overstiger belastningen", () => {
    const r = fordelBelastning(264, [mk("b", "Brita-filtre", 5)], {}, 12, STANDARD_SATSER);
    expect(r.maskiner[0].belastning).toBe(264);
  });
});

describe("periode", () => {
  it("standard er seneste 12 hele måneder", () => {
    expect(periode("12m", new Date(2026, 9, 21))).toMatchObject({ fra: "2025-10-01", til: "2026-09-01" });
  });
});
