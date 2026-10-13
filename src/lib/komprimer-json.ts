// Store serverfunktionssvar gzip-komprimeres og sendes som base64-streng,
// så de holder sig under serverfunktionernes grænse for svarstørrelse.

async function strømTilBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function bytesTilBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function base64TilBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function komprimerJson(value: unknown): Promise<string> {
  const input = new Blob([JSON.stringify(value)]).stream();
  const gz = input.pipeThrough(new CompressionStream("gzip"));
  return bytesTilBase64(await strømTilBytes(gz));
}

export async function dekomprimerJson<T>(b64: string): Promise<T> {
  const input = new Blob([base64TilBytes(b64) as BlobPart]).stream();
  const raw = input.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(raw).text()) as T;
}
