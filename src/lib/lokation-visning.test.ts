import { describe, expect, it } from "vitest";
import { visSomAktivLokation } from "./lokation-visning";

describe("Lokationsafsnit (kun præsentation)", () => {
  it("viser BEC's Havsteensvej og Langebjerg som aktive", () => {
    expect(visSomAktivLokation("aktiv_kunde", 285402)).toBe(true);
    expect(visSomAktivLokation("aktiv_kunde", 73440)).toBe(true);
  });
  it("viser BEC's Marmorvej og Skibsbyggerivej under sovende konti", () => {
    expect(visSomAktivLokation("sovende_kunde", 531)).toBe(false);
    expect(visSomAktivLokation("sovende_kunde", 382)).toBe(false);
  });
  it("viser Herning via forhandler som aktiv uden omsætning", () => {
    expect(visSomAktivLokation(null, null, true)).toBe(true);
    expect(visSomAktivLokation(null, null, false)).toBe(false);
  });
  it("inkluderer servicekunder og øvrige konti med omsætning", () => {
    expect(visSomAktivLokation("servicekunde", 0)).toBe(true);
    expect(visSomAktivLokation("nyt_emne", 100)).toBe(true);
    expect(visSomAktivLokation("nyt_emne", 0)).toBe(false);
  });
});