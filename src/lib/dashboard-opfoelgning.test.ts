import { describe, expect, it } from "vitest";
import { egneListeOpfoelgninger } from "./dashboard-opfoelgning";

const row = { id: "assignment", company_id: "company", contact_list_id: "list", assigned_to: "mads", status: "ring_igen", next_followup_date: "2026-11-09", next_action_note: null, company: { id: "company", name: "Firma", city: null } };
const boost = { company_id: "company", contact_list_id: "list", user_id: "boost", rolle: "telemarketing", udfald: "ring_igen" };
describe("sælgerens listeopfølgninger", () => {
  it("Boosts ring-igen er ikke Mads' opgave selv om listen er tildelt Mads", () => {
    expect(egneListeOpfoelgninger([row], [boost], "mads")).toEqual([]);
  });
  it("bevarer Mads' egne udfald", () => {
    expect(egneListeOpfoelgninger([row], [{ ...boost, user_id: "mads", rolle: "saelger" }], "mads")).toEqual([row]);
  });
  it("note gør ikke Boosts opgave til sælgerens", () => {
    expect(egneListeOpfoelgninger([row], [{ ...boost, user_id: "mads", rolle: "saelger", udfald: "note" }, boost], "mads")).toEqual([]);
  });
  it("afsluttede udfald er ikke åbne opfølgninger", () => {
    expect(egneListeOpfoelgninger([{ ...row, status: "ikke_interesseret" }], [], "mads")).toEqual([]);
  });
  it("andre sælgeres opgaver vises ikke", () => {
    expect(egneListeOpfoelgninger([{ ...row, assigned_to: "anden" }], [], "mads")).toEqual([]);
  });
});