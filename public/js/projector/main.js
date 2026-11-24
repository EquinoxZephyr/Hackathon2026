// Het beamervenster: toont enkel de slide die de lector in de presentatieweergave kiest.
// Alles komt binnen via het kanaal met het andere venster; er is geen verbinding met de server nodig.
import { $ } from '../shared/dom.js';
import { MESSAGES, navigationFor, openChannel } from '../presentation/channel.js';
import { openPdf } from '../presentation/pdfjs.js';
import { SlideView } from '../presentation/slideView.js';

const view = new SlideView($('#slide'), { withMedia: true });
let deck = null;
let lastState = null;

const mediaElement = (item) => view.mediaElements.find((element) => element.dataset.item === String(item));

async function loadDeck({ pdfData, media, join }) {
  deck?.media.flat().forEach((item) => item.blob && URL.revokeObjectURL(item.url));
  deck = {
    document: await openPdf(pdfData),
    media: media.map((items) => items.map((item) => ({ ...item, url: item.blob ? URL.createObjectURL(item.blob) : item.url }))),
  };
  $('#join-qr').src = join.qr;
  $('#join-code').textContent = join.code;
  $('#join-url').textContent = join.joinUrl;
  $('#waiting').hidden = true;
  if (lastState) showState(lastState);
}

function showState(state) {
  lastState = state;
  if (!deck) return;
  view.show(deck, state.index);
  $('#join').hidden = !state.qrVisible;
}

function applyMedia({ slide, item, action, time }) {
  if (slide !== lastState?.index) return;
  const element = mediaElement(item);
  if (!element) return;
  if (Math.abs(element.currentTime - time) > 0.5) element.currentTime = time;
  if (action === 'play') element.play().catch(() => {});
  if (action === 'pause') element.pause();
}

const channel = openChannel((message) => {
  if (message.type === MESSAGES.DECK) loadDeck(message);
  if (message.type === MESSAGES.STATE) showState(message);
  if (message.type === MESSAGES.MEDIA) applyMedia(message);
  if (message.type === MESSAGES.END) {
    view.clear();
    $('#join').hidden = true;
    $('#ended').hidden = false;
  }
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

// Een afstandsbediening stuurt toetsen naar het venster dat de focus heeft: dat kan ook de beamer zijn.
document.addEventListener('keydown', (event) => {
  if (event.key === 'f' || event.key === 'F') return toggleFullscreen();
  const action = navigationFor(event);
  if (!action) return;
  event.preventDefault();
  channel.send(MESSAGES.KEY, { action });
});
$('#fullscreen').addEventListener('click', toggleFullscreen);

window.addEventListener('pagehide', () => channel.send(MESSAGES.BYE));
channel.send(MESSAGES.HELLO);
