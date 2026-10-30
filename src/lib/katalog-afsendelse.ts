/** Kun Microsoft-fejl gør udsendelsen fejlet; efterarbejde må aldrig genudsende mailen. */
export async function afsendKatalog<T = string>(flow: {
  opret: () => Promise<T>;
  send: (id: T) => Promise<unknown>;
  fejlet: (id: T) => Promise<void>;
  sendt: (id: T) => Promise<void>;
  afslut: (id: T) => Promise<void>;
}) {
  const id = await flow.opret();
  try {
    await flow.send(id);
  } catch (error) {
    try {
      await flow.fejlet(id);
    } catch (statusError) {
      console.error("Kunne ikke registrere fejlet udsendelse", statusError);
    }
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
  await flow.sendt(id);
  await flow.afslut(id);
  return { ok: true as const, id };
}
