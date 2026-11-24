// Verbinding tussen de presentatieweergave (laptop) en het projectievenster (beamer).
// Beide vensters draaien in dezelfde browser, dus een BroadcastChannel volstaat: niets gaat over het internet.

const CHANNEL_NAME = 'frank-projector';

export const MESSAGES = Object.freeze({
  HELLO: 'hello', // beamer is open en wil de presentatie
  BYE: 'bye', // beamer is gesloten
  DECK: 'deck', // de pdf en de media
  STATE: 'state', // welke slide, en of de QR-code zichtbaar is
  MEDIA: 'media', // video afspelen, pauzeren of verspringen
  KEY: 'key', // toets ingedrukt in het beamervenster (bv. een presenter-afstandsbediening)
  END: 'end', // de les is afgelopen
});

export function openChannel(onMessage) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => onMessage(event.data);
  return {
    send: (type, data = {}) => channel.postMessage({ type, ...data }),
    close: () => channel.close(),
  };
}

// Toetsen van het toetsenbord of van een presenter-afstandsbediening (die sturen meestal PageDown/PageUp).
const NAVIGATION = {
  ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', n: 'next',
  ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev', p: 'prev',
  ' ': 'media', k: 'media',
};

export function navigationFor(event) {
  if (event.target.closest?.('input, select, textarea, video, audio, iframe')) return null;
  return NAVIGATION[event.key] ?? null;
}
