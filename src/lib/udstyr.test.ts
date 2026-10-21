import { describe, expect, it } from "vitest";
import { fordelBelastning, STANDARD_SATSER, periode, harAftale, handlinger, beregnLokationer, type GrundMaskine } from "./udstyr";

const mk = (id: string, t: string, u = 3): GrundMaskine => ({ id, sn: id, lev: "1", b: t, t, u, o: null, tl: null, at: null, st: null });

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

describe("aktiv serviceaftale", () => {
  it("kræver aftaletype og status 1 [Aktiv - Har aftale]", () => {
    expect(harAftale({ at: "1 [Serviceaftale]", st: "1 [Aktiv - Har aftale]" })).toBe(true);
    expect(harAftale({ at: "1 [Serviceaftale]", st: "20 [Registrering af serienr.]" })).toBe(false);
    expect(harAftale({ at: "0", st: "1 [Aktiv - Har aftale]" })).toBe(false);
  });
});

describe("udskiftningskandidater", () => {
  const idag = new Date(2026, 9, 21);
  const lok = (rd: number, mo: number, m: GrundMaskine) => beregnLokationer({ erAdmin: true, mk: [m], lok: [{
    lev: "1", id: "l", cid: "c", kunde: "K", adr: "", leje: 0, bel: 0, si: 0, ak: 0, mo, rd, pa: 0, vdb: 0, vmd: 0, fm: null, lt: {} }] }, 12, STANDARD_SATSER);
  const ny = { ...mk("w", "Wittenborg"), o: "2024-01-01", tl: 999_999 };
  it("alder over 5 år giver kandidat", () => {
    expect(handlinger(lok(0, 0, { ...ny, o: "2020-01-01" }), STANDARD_SATSER, idag).udskift).toHaveLength(1);
  });
  it("reservedele + montør over 3.000 kr. giver kandidat", () => {
    expect(handlinger(lok(-2000, -1500, ny), STANDARD_SATSER, idag).udskift).toHaveLength(1);
    expect(handlinger(lok(-1000, -1500, ny), STANDARD_SATSER, idag).udskift).toHaveLength(0);
  });
  it("tællerstand bruges ikke uden grænse pr. maskintype", () => {
    expect(handlinger(lok(0, 0, ny), STANDARD_SATSER, idag).udskift).toHaveLength(0);
    expect(handlinger(lok(0, 0, ny), { ...STANDARD_SATSER, taellerPrType: { Wittenborg: 500_000 } }, idag).udskift).toHaveLength(1);
  });
});
