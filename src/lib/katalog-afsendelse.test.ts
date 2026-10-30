import { describe, expect, it, vi } from "vitest";
import { afsendKatalog } from "./katalog-afsendelse";

describe("katalogets afsendelsesrækkefølge", () => {
  it("opretter udsendelse før mail og gemmer først kontakt/aktivitet efter succes", async () => {
    const steps: string[] = [];
    const result = await afsendKatalog({
      opret: async () => { steps.push("opret"); return "udsendelse"; },
      send: async (id) => { expect(id).toBe("udsendelse"); steps.push("mail"); },
      sendt: async () => { steps.push("sendt"); },
      afslut: async () => { steps.push("kontakt+aktivitet"); },
      fejlet: vi.fn(),
    });
    expect(result.ok).toBe(true);
    expect(steps).toEqual(["opret", "mail", "sendt", "kontakt+aktivitet"]);
  });
  it("sætter fejlet og returnerer Microsofts fejl uden kontakt eller aktivitet", async () => {
    const sendt = vi.fn(); const afslut = vi.fn(); const fejlet = vi.fn();
    const error = "Mailafsendelse fejlede [403]: AccessDenied";
    expect(await afsendKatalog({ opret: async () => "id", send: async () => { throw new Error(error); }, sendt, afslut, fejlet }))
      .toEqual({ ok: false, error });
    expect(fejlet).toHaveBeenCalledWith("id");
    expect(sendt).not.toHaveBeenCalled();
    expect(afslut).not.toHaveBeenCalled();
  });
  it("genudsending undgås hvis efterarbejde fejler efter Microsoft har accepteret", async () => {
    const fejlet = vi.fn(); const send = vi.fn();
    await expect(afsendKatalog({ opret: async () => "id", send, sendt: async () => {}, afslut: async () => { throw new Error("kontakt fejlede"); }, fejlet })).rejects.toThrow("kontakt fejlede");
    expect(send).toHaveBeenCalledTimes(1);
    expect(fejlet).not.toHaveBeenCalled();
  });
});