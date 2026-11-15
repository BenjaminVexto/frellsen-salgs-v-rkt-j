import { describe, it, expect } from "vitest";
import { tekstOmsaetning, tekstAktive, tekstStroem, tekstIndeks, fmtKr, aendringOrd, vindue } from "./graf-tekst";

const M = (o: Record<string, number>) => new Map(Object.entries(o));
const tre = (y: number, v: number) => ({ [`${y}-08`]: v, [`${y}-09`]: v, [`${y}-10`]: v });

describe("graf-tekst", () => {
  it("formaterer beløb som mio./t.kr.", () => {
    expect(fmtKr(19_040_000)).toBe("19,0 mio.");
    expect(fmtKr(344_400)).toBe("344 t.kr.");
  });
  it("under ±5 % er uændret, ikke svagt", () => {
    expect(aendringOrd(4.9)).toBe("stort set uændret");
    expect(aendringOrd(-50)).toBe("halveret");
    expect(aendringOrd(-8.2)).toBe("faldet 8 %");
  });
  it("sammenligner med samme 3 måneder sidste år", () => {
    const v = vindue({ privat: M({ ...tre(2025, 1), ...tre(2026, 1) }) }, "2026-10", 13);
    expect(v.foer).toEqual(["2025-08", "2025-09", "2025-10"]);
    expect(v.sidsteAar).toBe(true);
  });
  it("falder tilbage til de 3 foregående måneder uden data sidste år", () => {
    const s = { privat: M({ "2026-05": 1, "2026-06": 1, "2026-07": 1, ...tre(2026, 1) }) };
    const v = vindue(s, "2026-10", 6);
    expect(v.foer).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(tekstOmsaetning(s, "2026-10", 6, false).overskrift).toContain("mod de 3 foregående måneder");
  });
  it("overskriften nævner gruppen der forklarer faldet", () => {
    const s = {
      privat: M({ ...tre(2025, 100), ...tre(2026, 80) }), offentlig: M({ ...tre(2025, 100), ...tre(2026, 99) }),
      privat_45: M({ ...tre(2025, 30), ...tre(2026, 11) }), privat_ovrige: M({ ...tre(2025, 70), ...tre(2026, 69) }),
    };
    const t = tekstOmsaetning(s, "2026-10", 13, true);
    expect(t.overskrift).toBe("Omsætningen er faldet 11 % – næsten hele faldet er KPG3 45.");
  });
  it("aktive kunder er antal i sidste måned, ikke snit", () => {
    const s = {
      privat: M({ "2025-10": 3006, "2026-10": 2514 }), offentlig: M({ "2025-10": 3620, "2026-10": 3640 }),
      privat_45: M({ "2025-10": 1040, "2026-10": 588 }), privat_ovrige: M({ "2025-10": 1966, "2026-10": 1926 }),
    };
    const t = tekstAktive(s, "2026-10", true);
    expect(t.overskrift).toBe("2.514 aktive forhandlingskunder – 492 færre end sidste år, næsten alle i KPG3 45.");
    expect(t.linjer[0]).toBe("KPG3 45: 588 (\u221243 %). Private: 1.926 (\u22122 %). Udbud: 3.640 (uændret).");
  });
  it("nye kunder skrives pr. måned de seneste 3 måneder", () => {
    const s = { privat: M({ ...tre(2025, 20), ...tre(2026, 15) }), offentlig: M({}) };
    expect(tekstStroem(s, "2026-10", 13, false, "nye kunder").overskrift)
      .toBe("15 nye forhandlingskunder pr. måned de seneste 3 måneder – mod 20 sidste år.");
  });
  it("udvikling angiver indeksbasis og største bevægelse", () => {
    const t = tekstIndeks([
      { navn: "↳ heraf off. aftalekunder (KPG3 45)", per: M({ "2026-04": 100, "2026-10": 54 }) },
      { navn: "Total", per: M({ "2026-04": 100, "2026-10": 92 }) },
    ], ["2026-04", "2026-10"]);
    expect(t?.overskrift).toBe("Indeks: apr 2026 = 100. KPG3 45 står på 54 – næsten halveret siden apr.");
  });
});
