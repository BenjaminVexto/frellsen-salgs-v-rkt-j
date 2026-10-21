import { describe, expect, it } from "vitest";
import { serviceVisningsGrundlag, erFilter, prVirksomhed, varekoebAndetSted, fordelBelastning, STANDARD_SATSER, periode, harAftale, handlinger, beregnLokationer, type GrundMaskine } from "./udstyr";

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
    expect(r.maskiner.find((m) => m.id === "w")?.belastning).toBe(750);
    expect(r.maskiner.find((m) => m.id === "r")?.belastning).toBe(250);
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
    lev: "1", id: "l", cid: "c", kunde: "K", adr: "", leje: 0, bel: 0, si: 0, ak: 0, mo: 0, rd: 0, rk: -(rd + mo), pa: 0, vdb: 0, vmd: 0, fm: null, lt: {} }] }, 12, STANDARD_SATSER);
  const ny = { ...mk("w", "Wittenborg"), o: "2024-01-01", tl: 999_999 };
  it("alder over 8 år giver kun kandidat med reparationer over 1.000 kr.", () => {
    const gl = { ...ny, o: "2017-01-01" };
    expect(handlinger(lok(0, 0, gl), STANDARD_SATSER, idag).udskift).toHaveLength(0);
    expect(handlinger(lok(-600, -500, gl), STANDARD_SATSER, idag).udskift).toHaveLength(1);
    expect(handlinger(lok(-600, -500, { ...ny, o: "2020-01-01" }), STANDARD_SATSER, idag).udskift).toHaveLength(0);
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

describe("filtre og kundeejede", () => {
  const g = (mk2: GrundMaskine[], lt: Record<string, number> = {}) => beregnLokationer({ erAdmin: true, mk: mk2, lok: [{
    lev: "1", id: "l", cid: "c", kunde: "K", adr: "", leje: 1000, bel: -1200, si: 0, ak: 0, mo: 0, rd: 0, pa: 0, vdb: 0, vmd: 0, fm: null, lt }] }, 12, STANDARD_SATSER)[0];
  const aft = { at: "1 [Serviceaftale]", st: "1 [Aktiv - Har aftale]" };
  it("filtre tæller ikke som serviceaftaler, men som filteraftaler", () => {
    const l = g([{ ...mk("b", "Brita-filtre", 5), ...aft }, { ...mk("k", "Rex-Royal", 0), ...aft }]);
    expect(l.antalAftaler).toBe(1);
    expect(l.antalFilteraftaler).toBe(1);
  });
  it("filterleje flyttes fra leje netto til service", () => {
    const l = g([mk("b", "Brita-filtre", 5), mk("w", "Wittenborg")], { "Brita-filtre": 200, Wittenborg: 800 });
    expect(l.lejeNetto).toBe(800 - (1200 - 528));
    expect(l.serviceNetto).toBe(200 - 528);
  });
  it("filterhoveder genkendes også på beskrivelse", () => {
    expect(erFilter({ t: "Andet", b: "Filterhoved Purity" })).toBe(true);
  });
  it("lokation uden varekøb markeres, når virksomheden køber et andet sted", () => {
    const base = g([mk("w", "Wittenborg")]);
    const anden = { ...base, lev: "2", vdb: 5000, maskiner: [] };
    const v = prVirksomhed([base, anden])[0];
    expect(v.vdb).toBe(5000);
    expect(varekoebAndetSted(base, v)).toBe(true);
  });
});

describe("kundeejede servicemodeller i visningen", () => {
  const grundlag = (b: string, u = 0) => ({ erAdmin: true, lok: [], mk: [{ ...mk("e:1", "Andet", u), b }] });
  it("genkender Wittenborg-modeller uden mærkenavn", () => {
    for (const b of ["9100 B2C", "9000 R&G", "95 B2C", "7100, Plus FB", "W100 Core B2C", "FB7100 MAXI"]) {
      expect(serviceVisningsGrundlag(grundlag(b)).mk[0].t).toBe("Wittenborg");
    }
  });
  it("vandudstyr klassificeres som Vandkøler", () => {
    for (const b of ["Borg og Overström", "Hi-Class 30L Still", "H2OMY TOP 15L CO2"]) {
      expect(serviceVisningsGrundlag(grundlag(b)).mk[0].t).toBe("Vandkøler");
    }
  });
  it("filterhoveder flyttes til filteraftaler", () => {
    expect(serviceVisningsGrundlag(grundlag("Filterhoved Purity")).mk[0].t).toBe("Brita-filtre");
  });
  it("ændrer ikke Frellsen-maskiner eller økonomiberegninger", () => {
    const g = grundlag("9100 B2C", 3);
    expect(serviceVisningsGrundlag(g).mk).toEqual(g.mk);
    const g2 = { erAdmin: true, mk: grundlag("9100 B2C").mk, lok: [{ lev: "1", id: "l", cid: "c", kunde: "K", adr: "", leje: 1000, bel: -1200, si: 500, ak: 100, mo: -200, rd: -100, pa: -50, vdb: 3000, vmd: 1, fm: null, lt: {} }] };
    const foer = beregnLokationer(g2, 12, STANDARD_SATSER)[0];
    const efter = beregnLokationer(serviceVisningsGrundlag(g2), 12, STANDARD_SATSER)[0];
    expect(efter.dbInkl).toBe(foer.dbInkl);
    expect(efter.lejeNetto).toBe(foer.lejeNetto);
    expect(efter.serviceNetto).toBe(foer.serviceNetto);
  });
});
