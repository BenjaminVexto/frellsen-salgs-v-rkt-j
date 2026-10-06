import { describe, it, expect } from "vitest";
import { adresseValg, gyldigAktivitetsTid } from "./adresse-grupper";

describe("aktivitetsdato", () => {
  const nu = new Date("2026-10-06T12:00:00Z");
  it("tillader 14 dage tilbage", () => {
    expect(gyldigAktivitetsTid(new Date("2026-09-22T12:30:00Z"), nu)).toBe(true);
  });
  it("afviser mere end 14 dage tilbage", () => {
    expect(gyldigAktivitetsTid(new Date("2026-09-21T12:00:00Z"), nu)).toBe(false);
  });
  it("afviser fremtid", () => {
    expect(gyldigAktivitetsTid(new Date("2026-10-06T13:00:00Z"), nu)).toBe(false);
  });
});

describe("adressevalg", () => {
  const locs = [
    { id: "a", address: "Hannemanns Allé 53", zip: "2300", city: "København S", visma_delivery_no: "2300001", saelger_user_id: "x" },
    { id: "b", address: "Hannemanns Allé 53, 2. sal", zip: "2300", city: "København S", visma_delivery_no: "2873600", is_primary: true, saelger_user_id: "x" },
    { id: "c", address: "Vesterbrogade 1", zip: "1620", city: "København V", visma_delivery_no: "1", saelger_user_id: "me" },
  ];
  it("samler konti på samme adresse og gemmer på primær konto", () => {
    const v = adresseValg(locs, "me");
    const h = v.find((g) => g.locIds.includes("a"))!;
    expect(h.locIds.sort()).toEqual(["a", "b"]);
    expect(h.kontoId).toBe("b");
    expect(h.label).toContain("kundenr. 2300001, 2873600");
  });
  it("egne adresser står øverst", () => {
    expect(adresseValg(locs, "me")[0]!.locIds).toEqual(["c"]);
  });
});
