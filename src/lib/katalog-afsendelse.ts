/** Kun Microsoft-fejl gør udsendelsen fejlet; efterarbejde må aldrig genudsende mailen. */
export async function afsendKatalog(flow: {
  opret: () => Promise<string>;
  send: (id: string) => Promise<unknown>;
  fejlet: (id: string) => Promise<void>;
  sendt: (id: string) => Promise<void>;
  afslut: (id: string) => Promise<void>;
}) {
  const id = await flow.opret();
  try {
    await flow.send(id);
  } catch (error) {
    try {
      await flow.fejlet(id);
    } catch (statusError) {
      console.error("Kunne ikke registrere fejlet katalogudsendelse", statusError);
    }
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
  await flow.sendt(id);
  await flow.afslut(id);
  return { ok: true as const, id };
}