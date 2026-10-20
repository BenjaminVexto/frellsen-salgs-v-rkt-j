import { describe, expect, it } from "vitest";
import { opsummerMaskintjek } from "./bonus-maskin-vurdering";
import { maskinStatusTekst } from "./bonus-maskin-visning";

describe("machine bonus review before locking", () => {
  it("counts unclassified machines separately from replacements awaiting review", () => {
    const r = opsummerMaskintjek([
      { status: "vurdering", bonusklasse: null },
      { status: "vurdering", bonusklasse: "animo" },
      { status: "bonus", bonusklasse: "rex" },
      { status: "ingen", bonusklasse: "ingen" },
    ]);
    expect(r).toEqual({ uklassificeret: 1, tilVurdering: 1 });
  });
  it("same machine at same customer is shown to sellers as no bonus with the plain reason", () => {
    expect(maskinStatusTekst({ status: "ingen", aarsag: "Samme maskine hos samme kunde" })).toEqual({ label: "Ingen bonus", aarsag: "Samme maskine hos samme kunde" });
  });
});
