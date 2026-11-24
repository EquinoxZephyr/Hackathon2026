// Houdt de laatste seconden geluid bij in het werkgeheugen (16 kHz mono) en overschrijft het oudste.
// Er wordt niets opgeslagen; alleen bij een meertalige les gaat dit stukje mee bij een tik.

export class RecentAudio {
  #samples;
  #write = 0;
  #filled = 0;
  #step;
  #position = 0;

  constructor(seconds, targetRate, inputRate) {
    this.targetRate = targetRate;
    this.#samples = new Float32Array(seconds * targetRate);
    this.#step = inputRate / targetRate;
  }

  // Neemt een blok op aan de snelheid van de microfoon en houdt elke n-de sample over.
  push(block) {
    let position = this.#position;
    for (; position < block.length; position += this.#step) {
      this.#samples[this.#write] = block[Math.floor(position)];
      this.#write = (this.#write + 1) % this.#samples.length;
      this.#filled = Math.min(this.#filled + 1, this.#samples.length);
    }
    this.#position = position - block.length;
  }

  // Het opgenomen stukje als wav-bestand (16-bit PCM), van oud naar nieuw.
  toWav() {
    if (this.#filled === 0) return null;
    const start = (this.#write - this.#filled + this.#samples.length) % this.#samples.length;
    const buffer = new ArrayBuffer(44 + this.#filled * 2);
    const view = new DataView(buffer);
    const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));

    text(0, 'RIFF');
    view.setUint32(4, 36 + this.#filled * 2, true);
    text(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, this.targetRate, true);
    view.setUint32(28, this.targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, this.#filled * 2, true);

    for (let i = 0; i < this.#filled; i += 1) {
      const sample = Math.max(-1, Math.min(1, this.#samples[(start + i) % this.#samples.length]));
      view.setInt16(44 + i * 2, sample * 0x7fff, true);
    }
    return buffer;
  }
}
