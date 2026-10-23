import { describe, expect, it } from "vitest";
import { tilbudAabningLinje, type ModtagerSporing } from "./tilbud-aabning";

const NOW = new Date("2026-10-23T12:00:00Z");

function m(over: Partial<ModtagerSporing>): ModtagerSporing {
  return {
    sendt_at: null,
    antal_aabninger: 0,
    foerst_aabnet_at: null,
    seneste_aabnet_at: null,
    ...over,
  };
}

describe("tilbudAabningLinje", () => {
  it("ingen modtagere -> ingen linje", () => {
    expect(tilbudAabningLinje([], "2026-10-01", NOW)).toBeNull();
  });

  it("ingen åbning 3+ dage efter sendt -> rød advarsel", () => {
    const linje = tilbudAabningLinje([m({ sendt_at: "2026-10-19T10:00:00Z" })], null, NOW);
    expect(linje).toEqual({ text: "Tilbud ikke åbnet", tone: "rod" });
  });

  it("ingen åbning under 3 dage efter sendt -> neutral", () => {
    const linje = tilbudAabningLinje([m({ sendt_at: "2026-10-22T10:00:00Z" })], null, NOW);
    expect(linje).toEqual({ text: "Ikke åbnet", tone: "neutral" });
  });

  it("bruger tilbuddets sent_date hvis modtager ikke er markeret sendt", () => {
    const linje = tilbudAabningLinje([m({})], "2026-10-15", NOW);
    expect(linje?.tone).toBe("rod");
  });

  it("2+ åbninger inden for 48 timer -> tællerlinje", () => {
    const linje = tilbudAabningLinje(
      [
        m({
          sendt_at: "2026-10-20T10:00:00Z",
          antal_aabninger: 3,
          foerst_aabnet_at: "2026-10-21T08:00:00Z",
          seneste_aabnet_at: "2026-10-22T09:00:00Z",
        }),
      ],
      null,
      NOW,
    );
    expect(linje?.tone).toBe("neutral");
    expect(linje?.text).toMatch(/^Åbnet 3 gange · seneste /);
  });

  it("åbninger spredt over mere end 48 timer -> simpel åbnet-linje", () => {
    const linje = tilbudAabningLinje(
      [
        m({
          sendt_at: "2026-10-10T10:00:00Z",
          antal_aabninger: 2,
          foerst_aabnet_at: "2026-10-11T08:00:00Z",
          seneste_aabnet_at: "2026-10-20T09:00:00Z",
        }),
      ],
      null,
      NOW,
    );
    expect(linje?.tone).toBe("neutral");
    expect(linje?.text).toMatch(/^Åbnet /);
    expect(linje?.text).not.toContain("gange");
  });

  it("tæller åbninger på tværs af flere modtagere", () => {
    const linje = tilbudAabningLinje(
      [
        m({ sendt_at: "2026-10-21T10:00:00Z", antal_aabninger: 1, foerst_aabnet_at: "2026-10-22T08:00:00Z", seneste_aabnet_at: "2026-10-22T08:00:00Z" }),
        m({ sendt_at: "2026-10-21T10:00:00Z", antal_aabninger: 1, foerst_aabnet_at: "2026-10-22T12:00:00Z", seneste_aabnet_at: "2026-10-22T12:00:00Z" }),
      ],
      null,
      NOW,
    );
    expect(linje?.text).toMatch(/^Åbnet 2 gange · seneste /);
  });
});
