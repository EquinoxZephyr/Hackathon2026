// Toont één slide uit de pdf, zo groot als past in de container, met de video's erop.
// Dezelfde weergave dient voor de laptop (groot en klein) en voor de beamer.
import { createMediaElement, isPlayable } from './media.js';

export class SlideView {
  #frame;
  #canvas;
  #layer;
  #task = null;
  #index = -1;

  // `withMedia`: video's tonen; `controls`/`muted`: zie createMediaElement; `onMedia(index, element)`: nieuwe media.
  constructor(container, { withMedia = false, controls = false, muted = false, onMedia = () => {} } = {}) {
    this.container = container;
    this.options = { withMedia, controls, muted, onMedia };
    this.#frame = document.createElement('div');
    this.#frame.className = 'slide-frame';
    this.#canvas = document.createElement('canvas');
    this.#layer = document.createElement('div');
    this.#layer.className = 'slide-media';
    this.#frame.append(this.#canvas, this.#layer);
    container.replaceChildren(this.#frame);
    new ResizeObserver(() => this.#render()).observe(container);
  }

  get mediaElements() {
    return [...this.#layer.children].filter(isPlayable);
  }

  // `deck` = { document (pdf.js), media: per slide een lijst met { kind, url, rect } }
  show(deck, index) {
    this.deck = deck;
    if (index !== this.#index) {
      this.#index = index;
      this.#placeMedia();
    }
    return this.#render();
  }

  clear() {
    this.#index = -1;
    this.#layer.replaceChildren();
    this.#frame.hidden = true;
  }

  #placeMedia() {
    this.#layer.replaceChildren();
    if (!this.options.withMedia) return;
    const items = this.deck.media?.[this.#index] ?? [];
    items.forEach((item, itemIndex) => {
      const element = createMediaElement(item, this.options);
      element.dataset.item = itemIndex;
      this.#layer.append(element);
      this.options.onMedia(itemIndex, element);
    });
  }

  // Tekent de pagina scherp (rekening houdend met de pixeldichtheid) en zo groot als de container toelaat.
  async #render() {
    const { deck } = this;
    const index = this.#index;
    if (!deck?.document || index < 0) return;
    const page = await deck.document.getPage(index + 1);
    if (index !== this.#index) return;

    const base = page.getViewport({ scale: 1 });
    const { clientWidth, clientHeight } = this.container;
    const scale = Math.min(clientWidth / base.width, (clientHeight || Infinity) / base.height);
    if (!Number.isFinite(scale) || scale <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * ratio });

    this.#task?.cancel();
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    // intent 'print': tekent zonder te wachten op de animatielus van de browser. Die staat stil in een venster
    // dat de browser als verborgen ziet (bv. een beamervenster achter een ander venster), en dan zou de slide nooit verschijnen.
    this.#task = page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' });
    try {
      await this.#task.promise;
    } catch {
      return; // vervangen door een nieuwere tekening
    }
    // Pas wisselen als de nieuwe tekening klaar is: zo flitst het beeld niet.
    canvas.style.width = `${viewport.width / ratio}px`;
    canvas.style.height = `${viewport.height / ratio}px`;
    this.#canvas.replaceWith(canvas);
    this.#canvas = canvas;
    this.#frame.hidden = false;
  }
}
