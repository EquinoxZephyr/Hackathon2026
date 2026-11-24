// Presentatieweergave: de lector presenteert vanuit Frank. Op de laptop de huidige en volgende slide,
// de notities en (in main.js) de meldingen; op de beamer een apart venster met enkel de slide.
// Zo weet Frank altijd precies welke slide er getoond wordt.
import { $ } from '../shared/dom.js';
import { MESSAGES, navigationFor, openChannel } from '../presentation/channel.js';
import { play } from '../presentation/media.js';
import { renderSlideImage } from '../presentation/slideImage.js';
import { SlideView } from '../presentation/slideView.js';

const PROJECTOR_URL = '/projector.html';
const PROJECTOR_FEATURES = 'popup,width=1280,height=720';
const MEDIA_EVENTS = { play: 'play', pause: 'pause', seeked: 'seek' };

export class Presenter {
  #channel;
  #index = 0;
  #projectorConnected = false;
  #qrVisible = true;
  #images = new Map();

  // `pdf` = { document, data }, `slides` met { notes, media }, `join` = { qr, code, joinUrl }
  // `onSlideImage(index, image)` krijgt de huidige slide als jpg, om naar de studenten te sturen.
  constructor({ pdf, slides, join, onSlideChange, onSlideImage = () => {} }) {
    this.slides = slides;
    this.join = join;
    this.onSlideChange = onSlideChange;
    this.onSlideImage = onSlideImage;
    this.deck = {
      document: pdf.document,
      data: pdf.data,
      media: slides.map((slide) => slide.media.map((item) => ({ ...item, url: item.blob && URL.createObjectURL(item.blob) }))),
    };

    this.current = new SlideView($('#stage-current'), {
      withMedia: true,
      controls: true,
      onMedia: (itemIndex, element) => this.#watchMedia(itemIndex, element),
    });
    this.next = new SlideView($('#stage-next'));

    this.#channel = openChannel((message) => this.#onProjectorMessage(message));
    this.#sendDeck();

    this.onKey = (event) => {
      const action = navigationFor(event);
      if (!action) return;
      event.preventDefault();
      this.#act(action);
    };
    document.addEventListener('keydown', this.onKey);
    $('#prev-slide').onclick = () => this.#act('prev');
    $('#next-slide').onclick = () => this.#act('next');
    $('#open-projector').onclick = () => window.open(PROJECTOR_URL, 'frank-projector', PROJECTOR_FEATURES);
    $('#toggle-qr').onclick = () => this.#setQrVisible(!this.#qrVisible);
    this.#setQrVisible(true);
    this.go(0);
  }

  go(index) {
    const target = Math.max(0, Math.min(this.slides.length - 1, index));
    this.current.mediaElements.forEach((element) => element.pause());
    this.#index = target;

    this.current.show(this.deck, target);
    if (target + 1 < this.slides.length) this.next.show(this.deck, target + 1);
    else this.next.clear();
    $('#next-empty').hidden = target + 1 < this.slides.length;
    $('#slide-counter').textContent = `Slide ${target + 1} van ${this.slides.length}`;
    $('#notes').textContent = this.slides[target].notes || 'Geen notities bij deze slide.';

    this.#sendState();
    this.onSlideChange(target);
    this.#shareSlideImage(target);
  }

  // Elke slide wordt maar één keer als afbeelding getekend. Wie snel doorklikt, stuurt enkel de laatste door.
  async #shareSlideImage(index) {
    if (!this.#images.has(index)) this.#images.set(index, renderSlideImage(this.deck.document, index));
    const image = await this.#images.get(index).catch(() => null);
    if (image && index === this.#index) this.onSlideImage(index, image);
  }

  end() {
    this.#channel.send(MESSAGES.END);
    this.#channel.close();
    document.removeEventListener('keydown', this.onKey);
    this.deck.media.flat().forEach((item) => item.url && URL.revokeObjectURL(item.url));
  }

  #act(action) {
    if (action === 'next') this.go(this.#index + 1);
    if (action === 'prev') this.go(this.#index - 1);
    if (action === 'media') {
      const [element] = this.current.mediaElements;
      if (element?.paused) play(element);
      else element?.pause();
    }
  }

  // Start de (eerste) video op de huidige slide, bv. op het juiste moment in de demoles.
  playMedia() {
    const [element] = this.current.mediaElements;
    if (element?.paused) play(element);
  }

  #setQrVisible(visible) {
    this.#qrVisible = visible;
    $('#toggle-qr').textContent = visible ? 'QR-code op beamer verbergen' : 'QR-code op beamer tonen';
    this.#sendState();
  }

  // Op de laptop speelt de video stil mee zodra de beamer openstaat: het geluid komt van de beamer.
  #watchMedia(itemIndex, element) {
    element.muted = this.#projectorConnected;
    for (const [event, action] of Object.entries(MEDIA_EVENTS)) {
      element.addEventListener(event, () => {
        this.#channel.send(MESSAGES.MEDIA, { slide: this.#index, item: itemIndex, action, time: element.currentTime });
      });
    }
  }

  #onProjectorMessage(message) {
    if (message.type === MESSAGES.HELLO) {
      this.#projectorConnected = true;
      this.current.mediaElements.forEach((element) => { element.muted = true; });
      this.#sendDeck();
    } else if (message.type === MESSAGES.BYE) {
      this.#projectorConnected = false;
      this.current.mediaElements.forEach((element) => { element.muted = false; });
    } else if (message.type === MESSAGES.KEY) {
      this.#act(message.action);
    }
    $('#projector-status').textContent = this.#projectorConnected ? 'Beamervenster is open' : 'Beamervenster is niet open';
  }

  // De beamer krijgt de pdf en de video's als bestanden (geen links): die werken alleen in dit venster.
  #sendDeck() {
    this.#channel.send(MESSAGES.DECK, {
      pdfData: this.deck.data,
      media: this.slides.map((slide) => slide.media.map(({ kind, blob, url, name, rect }) => ({ kind, blob, url, name, rect }))),
      join: this.join,
    });
    this.#sendState();
  }

  #sendState() {
    this.#channel?.send(MESSAGES.STATE, { index: this.#index, qrVisible: this.#qrVisible });
  }
}
