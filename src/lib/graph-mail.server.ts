const MS_ENV = ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_AFSENDER"] as const;

export function graphMailKlar() {
  return MS_ENV.every((key) => Boolean(process.env[key]));
}

export async function sendGraphMail(input: { email: string; navn: string; subject: string; html: string; sellerName: string; sellerEmail: string }) {
  const tenant = process.env["MS_TENANT_ID"];
  const clientId = process.env["MS_CLIENT_ID"];
  const clientSecret = process.env["MS_CLIENT_SECRET"];
  const afsender = process.env["MS_AFSENDER"];
  if (!tenant || !clientId || !clientSecret || !afsender) throw new Error("Microsoft-mail er ikke sat op");
  if (new TextEncoder().encode(input.html).byteLength >= 20 * 1024) throw new Error("Mailens HTML er for stor (maks. 20 KB)");
  const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!tokenRes.ok) throw new Error(`Microsoft-login fejlede [${tokenRes.status}]: ${await tokenRes.text()}`);
  const token = await tokenRes.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Microsoft-login returnerede ingen adgang");
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(afsender)}/sendMail`, {
    method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      subject: input.subject, body: { contentType: "HTML", content: input.html },
      toRecipients: [{ emailAddress: { address: input.email, name: input.navn } }],
      from: { emailAddress: { address: afsender, name: `${input.sellerName} · Frellsen Kaffe` } },
      replyTo: [{ emailAddress: { address: input.sellerEmail, name: input.sellerName } }],
    }, saveToSentItems: true }),
  });
  if (!response.ok) throw new Error(`Mailafsendelse fejlede [${response.status}]: ${await response.text()}`);
  return response.status;
}