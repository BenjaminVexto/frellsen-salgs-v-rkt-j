import { afterEach, describe, expect, it, vi } from "vitest";
import { sendGraphMail } from "./graph-mail.server";
import { katalogMailHtml } from "./mail-html";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const input = { email: "recipient@example.com", navn: "Modtager", subject: "Frellsen Kaffes katalog", html: "<p>Katalog</p>", sellerName: "Sælger", sellerEmail: "seller@example.com" };

describe("fælles Graph-afsendelse", () => {
  it("bruger client credentials, MS_AFSENDER og sælgerens replyTo", async () => {
    vi.stubEnv("MS_TENANT_ID", "tenant"); vi.stubEnv("MS_CLIENT_ID", "client");
    vi.stubEnv("MS_CLIENT_SECRET", "test-secret"); vi.stubEnv("MS_AFSENDER", "salg@example.com");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-token" })).mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendGraphMail(input)).toBe(202);
    const tokenCall = fetchMock.mock.calls[0];
    expect(tokenCall[1].body.get("grant_type")).toBe("client_credentials");
    const sendCall = fetchMock.mock.calls[1];
    expect(sendCall[0]).toBe("https://graph.microsoft.com/v1.0/users/salg%40example.com/sendMail");
    const payload = JSON.parse(sendCall[1].body);
    expect(payload.message.from.emailAddress.address).toBe("salg@example.com");
    expect(payload.message.replyTo[0].emailAddress.address).toBe("seller@example.com");
    expect(payload.message.subject).toBe("Frellsen Kaffes katalog");
  });
  it("returnerer Microsofts konkrete status og fejltekst", async () => {
    vi.stubEnv("MS_TENANT_ID", "tenant"); vi.stubEnv("MS_CLIENT_ID", "client");
    vi.stubEnv("MS_CLIENT_SECRET", "test-secret"); vi.stubEnv("MS_AFSENDER", "salg@example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-token" })).mockResolvedValueOnce(new Response('{"error":{"message":"Access denied"}}', { status: 403 })));
    await expect(sendGraphMail(input)).rejects.toThrow('Mailafsendelse fejlede [403]: {"error":{"message":"Access denied"}}');
  });
  it("holder katalogmail under 20 KB selv med maksimalt navn og eksternt forsidebillede", () => {
    const html = katalogMailHtml({ navn: "Æ".repeat(200), link: "https://frellsen.lovable.app/k/00000000-0000-4000-8000-000000000000", billede: "https://example.com/cover.jpg", sellerName: "Sælger" });
    expect(new TextEncoder().encode(html).byteLength).toBeLessThan(20 * 1024);
  });
});