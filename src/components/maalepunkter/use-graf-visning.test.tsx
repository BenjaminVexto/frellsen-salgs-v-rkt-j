// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { useGrafVisning } from "./use-graf-visning";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("starts every customer graph with Forhandlingskunder, Udbudskunder and Total visible", () => {
  for (const id of ["omsaetning", "db", "kunder", "nye", "nye-lok"]) {
    const graf = renderHook(() => useGrafVisning("seller", id));
    const synlige = ["Forhandlingskunder", "Udbudskunder", "Total"].filter((s) => !graf.result.current.skjultListe.includes(s));
    expect(synlige).toEqual(["Forhandlingskunder", "Udbudskunder", "Total"]);
    act(() => graf.result.current.skiftSerie("Forhandlingskunder"));
    expect(graf.result.current.skjultListe).toEqual(["Forhandlingskunder"]);
  }
});

it("keeps three rounds of graph 3 presentation changes local without navigation", () => {
  const graf1 = renderHook(() => useGrafVisning("seller", "omsaetning", ["Privat"]));
  const graf3 = renderHook(() => useGrafVisning("seller", "kunder", ["Privat"]));
  const url = window.location.href;
  for (let i = 0; i < 3; i++) {
    for (const valg of ["graf", "udvikling", "tabel"] as const) {
      act(() => graf3.result.current.saetVisning(valg));
      expect(graf3.result.current.visning).toBe(valg);
      expect(graf1.result.current.visning).toBe("tabel");
      expect(window.location.href).toBe(url);
    }
  }
});

it("keeps selected series isolated and preserves each graph's saved view", () => {
  const graf2 = renderHook(() => useGrafVisning("seller", "db", ["Privat"]));
  const graf3 = renderHook(() => useGrafVisning("seller", "kunder", ["Privat"]));
  act(() => graf2.result.current.saetVisning("graf"));
  act(() => graf3.result.current.saetVisning("udvikling"));
  act(() => graf3.result.current.skiftSerie("Privat"));
  expect(graf3.result.current.skjultListe).toEqual([]);
  expect(graf2.result.current.skjultListe).toEqual(["Privat"]);
  expect(JSON.parse(localStorage.getItem("maalepunkt-visning:seller") ?? "{}")).toEqual({ db: "graf", kunder: "udvikling" });
});