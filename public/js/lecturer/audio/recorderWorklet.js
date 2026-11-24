// Draait in de audio-thread van de browser: stuurt het geluid van de microfoon in blokken door.
const BLOCK_SIZE = 4096;

class FrankRecorder extends AudioWorkletProcessor {
  #block = new Float32Array(BLOCK_SIZE);
  #filled = 0;

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (const sample of channel) {
        this.#block[this.#filled++] = sample;
        if (this.#filled === BLOCK_SIZE) {
          this.port.postMessage(this.#block.slice());
          this.#filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('frank-recorder', FrankRecorder);
