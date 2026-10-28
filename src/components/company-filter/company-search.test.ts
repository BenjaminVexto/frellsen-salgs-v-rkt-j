import { describe, expect, it } from "vitest";
import { antalMatchendeKonti, companyMatcher, lokationMatcher, matchendeKonti, tekstMatcherOrd } from "./company-search";
import type { CompanyRow, LocationLite } from "./types";
import type { ListeItem } from "@/components/cvr-gruppe";

const account = { name: "DSV Road A/S", address: "Hovedgaden 630", city: "Hedehusene", zip: "2640", cvr: "12345678", visma_id: "987654", visma_delivery_id: "543210" };
const location: LocationLite = { address: "Hovedgaden 630", city: "Hedehusene", zip: "2640", visma_delivery_no: "789123", p_numre: ["1020304050"], penhed_navne: ["LUK/DSV Road"] };

describe("Virksomheders fritekstsøgning", () => {
  it("DSV matcher ordstart, også efter separator, men ikke midt i vejnavne", () => {
    for (const name of ["DSV Road A/S", "LUK/DSV Road", "LUK-DSV", "LUK.DSV", "LUK,DSV"]) expect(tekstMatcherOrd(name, "dsv")).toBe(true);
    for (const name of ["Sandemandsvej", "Løjtegårdsvej", "ADSV", "1DSV"]) expect(tekstMatcherOrd(name, "dsv")).toBe(false);
  });
  it("æ/ø/å er bogstaver, ikke ordseparatorer", () => {
    expect(tekstMatcherOrd("Øster Ågade Æblevej", "øster")).toBe(true);
    expect(tekstMatcherOrd("ÅDSV ØDSV ÆDSV", "dsv")).toBe(false);
    expect(tekstMatcherOrd("Æblevej", "ble")).toBe(false);
  });
  it("DSV hedehusene matcher forskellige felter og kræver alle ord", () => {
    expect(companyMatcher(account, [], null, "DSV hedehusene")).toBe(true);
    expect(companyMatcher({ ...account, city: "Roskilde" }, [], null, "DSV hedehusene")).toBe(false);
  });
  it("ord må ramme konto og forskellige lokationer", () => {
    const elsewhere = { ...account, city: "Roskilde", address: null, zip: null };
    expect(companyMatcher(elsewhere, [location, { ...location, city: "Aarhus" }], null, "DSV hedehusene aarhus")).toBe(true);
    expect(companyMatcher({ ...elsewhere, name: "Kaffe" }, [], "DSV Road", "DSV")).toBe(true);
  });
  it("hovedgaden 630 og 2640 virker både på konto og lokation", () => {
    expect(companyMatcher(account, [], null, "hovedgaden 630")).toBe(true);
    expect(companyMatcher(account, [], null, "2640")).toBe(true);
    expect(lokationMatcher(location, "hovedgaden 630")).toBe(true);
    expect(lokationMatcher(location, "2640")).toBe(true);
    expect(lokationMatcher(location, "hovedgaden ukendt")).toBe(false);
  });
  it("talfelter matcher delstrenge pr. ord", () => {
    for (const word of ["264", "3456", "8765", "4321"]) expect(companyMatcher(account, [], null, word)).toBe(true);
    for (const word of ["8912", "3040"]) expect(lokationMatcher(location, word)).toBe(true);
    expect(lokationMatcher(location, "dsv 3040")).toBe(true);
  });
  it("telefon beholder hele søgningens cifre og kræver mindst fire", () => {
    const phoneAccount = { ...account, phone: "+45 40 86 91 01" };
    expect(companyMatcher(phoneAccount, [], null, "40 86 91 01")).toBe(true);
    expect(companyMatcher(phoneAccount, [], null, "+4540869101")).toBe(true);
    expect(companyMatcher(phoneAccount, [], null, "910")).toBe(false);
  });
});

describe("Matchende gruppekonti", () => {
  const rows = ["a", "b", "c", "d"].map((id) => ({ ...account, id } as CompanyRow));
  const group: ListeItem = { kind: "gruppe", cvr: "12345678", konti: rows, hits: new Set(["a", "c"]), tvungen: true };
  it("fritekst udvælger kun hits og tæller ikke resten af gruppen", () => {
    expect(matchendeKonti(group).map((r) => r.id)).toEqual(["a", "c"]);
    expect(antalMatchendeKonti([group, { kind: "en", row: rows[0] as CompanyRow }])).toBe(3);
    expect(group.konti.length).toBe(4);
  });
  it("uden fritekst tælles hele den filtrerede gruppe", () => {
    expect(antalMatchendeKonti([{ ...group, tvungen: false }])).toBe(4);
  });
});