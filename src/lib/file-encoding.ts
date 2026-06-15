// Decode a File/Blob as text, auto-detecting UTF-8 vs Windows-1252.
//
// Visma og en række andre danske ERP-systemer eksporterer CSV i Windows-1252
// (cp1252). Hvis vi læser dem som UTF-8 (f.text() / TextDecoder default)
// bliver alle æøå til U+FFFD (replacement character), så header-aliases ikke
// matcher og datoer/strenge bliver droppet i import. Vi bruger U+FFFD som
// signal — non-fatal UTF-8 decode først, og hvis der er replacement chars
// re-dekoder vi som windows-1252. Det fanger også cp1252-bytes der ved et
// tilfælde er gyldig UTF-8 men giver mojibake (ingen exception kastes).
//
// VIGTIGT: Brug ALDRIG "latin1" (ISO-8859-1) som fallback — Visma bruger
// cp1252 hvor 0x80-0x9F-området (fx € = 0x80, " = 0x93/0x94) ville blive
// til kontrol-tegn under latin1.
export function decodeFileBytes(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("windows-1252").decode(buf);
}

export async function readFileSmart(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  return decodeFileBytes(buf);
}
