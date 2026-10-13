import { describe, expect, it } from "vitest";
import { bestemSaelger, kamPortefoelje, type KamAftale, type Regel } from "./simulering-regler";

const lok = (p: Partial<{ kpg1: string; kpg2: string; kpg3: string; ansatte: number | null }> = {}) =>
  ({ kpg1: "10 [Erhverv]", kpg2: "(ingen)", kpg3: "20 [Kontor]", ansatte: 20, ...p });
const base = { nu: "anders", frellsen: false, geo: "f:ny" };
const ingenOffentlige: Regel = { id: "b", type: "udeluk", saelger: "f:ny", aktiv: true, b: { kpg3: ["40 [Offentlige Udbud]"], ansatteOver: 100 } };
const jes: Regel = { id: "a", type: "tildel", saelger: "jes", aktiv: true, b: { kpg1: ["69 [Regions aftale]"] } };

describe("simulering-regler", () => {
  it("Frellsen (199) beholder altid sin sælger, selv om en regel matcher", () => {
    expect(bestemSaelger({ ...base, frellsen: true, lok: lok({ kpg1: "69 [Regions aftale]" }), regler: [jes] }).til).toBe("anders");
  });
  it("tildel-regel rammer også lokationer der er på en KAM-aftale (ingen KAM-lås)", () => {
    expect(bestemSaelger({ ...base, lok: lok({ kpg1: "69 [Regions aftale]", kpg3: "40 [Offentlige Udbud]" }), regler: [jes] }).til).toBe("jes");
  });
  it("lokation i flade uden distrikt beholder sælger", () => {
    expect(bestemSaelger({ ...base, geo: null, lok: lok(), regler: [] }).til).toBe("anders");
  });
  it("tildel-regel vinder over geografi", () => {
    expect(bestemSaelger({ ...base, lok: lok({ kpg1: "69 [Regions aftale]" }), regler: [jes] })).toEqual({ til: "jes", aarsag: "a" });
  });
  it("uden regel-match gælder geografi", () => {
    expect(bestemSaelger({ ...base, lok: lok(), regler: [jes, ingenOffentlige] })).toEqual({ til: "f:ny", aarsag: "geo" });
  });
  it("må ikke have KPG3 40 → beholder nuværende sælger", () => {
    expect(bestemSaelger({ ...base, lok: lok({ kpg3: "40 [Offentlige Udbud]" }), regler: [ingenOffentlige] })).toEqual({ til: "anders", aarsag: "b" });
  });
  it("over 100 ansatte udelukkes, 100 ansatte gør ikke", () => {
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: 101 }), regler: [ingenOffentlige] }).til).toBe("anders");
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: 100 }), regler: [ingenOffentlige] }).til).toBe("f:ny");
  });
  it("ukendt antal ansatte tæller som under grænsen som standard", () => {
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: null }), regler: [ingenOffentlige] }).til).toBe("f:ny");
    const over: Regel = { ...ingenOffentlige, b: { ...ingenOffentlige.b, ukendtSomOver: true } };
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: null }), regler: [over] }).til).toBe("anders");
  });
  it("alternativ 'går til' sender lokationen til den valgte sælger", () => {
    const r: Regel = { ...ingenOffentlige, b: { ...ingenOffentlige.b, alternativ: "saelger", alternativSaelger: "jes" } };
    expect(bestemSaelger({ ...base, lok: lok({ ansatte: 500 }), regler: [r] }).til).toBe("jes");
  });
  it("inaktive regler ignoreres", () => {
    expect(bestemSaelger({ ...base, lok: lok({ kpg1: "69 [Regions aftale]" }), regler: [{ ...jes, aktiv: false }] }).til).toBe("f:ny");
  });
});

describe("KAM-portefølje", () => {
  const a1: KamAftale = { id: "1", navn: "Region", kodetype: "kpg1", koder: ["69 [Regions aftale]"], ansvarlige: ["jes"], aktiv: true };
  const a2: KamAftale = { id: "2", navn: "Udbud", kodetype: "kpg3", koder: ["40 [Offentlige Udbud]"], ansvarlige: ["jes", "ole"], aktiv: true };
  const rows = [
    { id: "L1", lok: lok({ kpg1: "69 [Regions aftale]", kpg3: "40 [Offentlige Udbud]" }), oms: 100, db: 10 },
    { id: "L2", lok: lok({ kpg3: "40 [Offentlige Udbud]" }), oms: 50, db: 5 },
    { id: "L3", lok: lok(), oms: 999, db: 99 },
  ];
  it("tæller en lokation kun én gang pr. ansvarlig", () => {
    expect(kamPortefoelje(rows, [a1, a2]).get("jes")).toEqual({ aftaler: 2, n: 2, oms: 150, db: 15 });
  });
  it("flere ansvarlige på samme aftale får hver især lokationerne", () => {
    expect(kamPortefoelje(rows, [a1, a2]).get("ole")).toEqual({ aftaler: 1, n: 2, oms: 150, db: 15 });
  });
  it("inaktive aftaler tæller ikke", () => {
    expect(kamPortefoelje(rows, [{ ...a1, aktiv: false }]).get("jes")).toBeUndefined();
  });
});
