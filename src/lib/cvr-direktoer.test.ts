import { describe, expect, it } from "vitest";
import { direktoererFraCvr } from "./cvr-direktoer";

const person = (navn: string, funktion: string, til: string | null = null) => ({
  deltager: { enhedstype: "PERSON", navne: [{ navn, periode: { gyldigTil: null } }] },
  organisationer: [{ medlemsData: [{ attributter: [{ type: "FUNKTION", vaerdier: [{ vaerdi: funktion, periode: { gyldigTil: til } }] }] }] }],
});

describe("direktør fra CVR", () => {
  it("tager kun aktive direktører, ikke fratrådte eller bestyrelse", () => {
    const v = { deltagerRelation: [person("Gammel", "DIREKTØR", "2007-03-01"), person("Formand", "FORMAND"), person("Aktiv", "DIREKTØR")] };
    expect(direktoererFraCvr(v)).toEqual(["Aktiv"]);
  });
  it("bruger indehaver, når der ingen direktør er", () => {
    expect(direktoererFraCvr({ deltagerRelation: [person("Ejer", "INDEHAVER")] })).toEqual(["Ejer"]);
  });
  it("ignorerer virksomheder som deltagere", () => {
    const v = { deltagerRelation: [{ ...person("Holding ApS", "DIREKTØR"), deltager: { enhedstype: "VIRKSOMHED", navne: [{ navn: "Holding ApS", periode: {} }] } }] };
    expect(direktoererFraCvr(v)).toEqual([]);
  });
});
