// Minimale zip-lezer (een .pptx is een zip-bestand). Gebruikt de ingebouwde DecompressionStream van de browser.

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const STORED = 0;
const decoder = new TextDecoder();

export function openZip(buffer) {
  const view = new DataView(buffer);
  let end = buffer.byteLength - 22;
  while (end >= 0 && view.getUint32(end, true) !== END_OF_CENTRAL_DIRECTORY) end -= 1;
  if (end < 0) throw new Error('Dit bestand kon niet geopend worden.');

  const entries = new Map();
  let offset = view.getUint32(end + 16, true);
  for (let i = view.getUint16(end + 10, true); i > 0; i -= 1) {
    const nameLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      size: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }

  // De (uitgepakte) inhoud van één bestand in de zip als Blob, of null als het er niet in zit.
  function blob(name, type = '') {
    const entry = entries.get(name);
    if (!entry) return null;
    const headerLength = 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true);
    const data = new Blob([new Uint8Array(buffer, entry.localOffset + headerLength, entry.size)]);
    if (entry.method === STORED) return new Blob([data], { type });
    return new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw')), { headers: { 'Content-Type': type } }).blob();
  }

  return {
    blob: async (name, type) => blob(name, type),
    text: async (name) => {
      const file = await blob(name);
      return file ? decoder.decode(await file.arrayBuffer()) : null;
    },
  };
}
