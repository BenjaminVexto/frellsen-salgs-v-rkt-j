import { describe, expect, it } from "vitest";
import { bygRingelisteMap, udledRingelisteMaerke } from "./ringeliste-maerke";

const base = { dato: "2026-10-20T10:00:00Z", listeNavn: "Efterår 2026", ringere: ["Anna Holm"] };

describe("udledRingelisteMaerke", () => {
  it("ikke ringet → aktivt mærkat", () => {
    const m = udledRingelisteMaerke({ ...base, status: "ny" })!;
    expect(m.tekst).toBe("Ringeliste · Ikke ringet");
    expect(m.aktiv).toBe(true);
    expect(m.graa).toBe(false);
  });

  it("skal_kontaktes behandles som ikke ringet", () => {
    expect(udledRingelisteMaerke({ ...base, status: "skal_kontaktes" })!.tekst).toBe("Ringeliste · Ikke ringet");
  });

  it("ring igen → aktivt mærkat med dato", () => {
    const m = udledRingelisteMaerke({ ...base, status: "ring_igen" })!;
    expect(m.tekst).toBe("Ringeliste · Ring igen 20. okt.");
    expect(m.aktiv).toBe(true);
  });

  it("ikke interesseret → gråt, inaktivt mærkat med dato", () => {
    const m = udledRingelisteMaerke({ ...base, status: "ikke_interesseret" })!;
    expect(m.tekst).toBe("Ringeliste · Ikke interesseret 20. okt.");
    expect(m.graa).toBe(true);
    expect(m.aktiv).toBe(false);
  });

  it("møde booket → Booket via ringeliste", () => {
    const m = udledRingelisteMaerke({ ...base, status: "moede_booket" })!;
    expect(m.tekst).toBe("Booket via ringeliste");
    expect(m.booket).toBe(true);
  });

  it("andre statusser giver intet mærkat", () => {
    expect(udledRingelisteMaerke({ ...base, status: "kontaktet" })).toBeNull();
    expect(udledRingelisteMaerke({ ...base, status: "vundet" })).toBeNull();
  });

  it("tooltip er listenavn + ringere", () => {
    expect(udledRingelisteMaerke({ ...base, status: "ny" })!.tooltip).toBe("Efterår 2026 · Anna Holm");
  });
});

describe("bygRingelisteMap", () => {
  const navne = new Map([["l1", "Liste A"], ["l2", "Liste B"]]);
  const ringere = new Map([["l1", ["Anna Holm"]], ["l2", ["Bo Ibsen", "Cecilie Dalsgaard"]]]);

  it("vælger nyeste tildeling pr. virksomhed", () => {
    const map = bygRingelisteMap(
      [
        { company_id: "c1", status: "ikke_interesseret", updated_at: "2026-09-01T00:00:00Z", contact_list_id: "l1" },
        { company_id: "c1", status: "ring_igen", updated_at: "2026-10-01T00:00:00Z", contact_list_id: "l2" },
      ],
      navne,
      ringere,
    );
    const info = map.get("c1")!;
    expect(info.status).toBe("ring_igen");
    expect(info.listeNavn).toBe("Liste B");
    expect(info.ringere).toEqual(["Bo Ibsen", "Cecilie Dalsgaard"]);
  });
});
