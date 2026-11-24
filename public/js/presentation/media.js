// Video's en geluid uit de PowerPoint, op dezelfde plek als op de slide.
// `rect` is de plaats als fractie van de slide (0–1).

const YOUTUBE = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/;

function embedUrl(url) {
  const youtube = url.match(YOUTUBE);
  return youtube ? `https://www.youtube-nocookie.com/embed/${youtube[1]}` : url;
}

function place(element, { x, y, w, h }) {
  Object.assign(element.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
  element.classList.add('slide-media-item');
  return element;
}

function notice(text) {
  const box = document.createElement('div');
  box.className = 'slide-media-notice';
  box.textContent = text;
  return box;
}

// `controls`: de lector bedient de video (laptop); op de beamer volgt ze enkel.
export function createMediaElement(item, { controls, muted }) {
  if (item.kind === 'video' || item.kind === 'audio') {
    const element = document.createElement(item.kind);
    Object.assign(element, { src: item.url, controls, muted, preload: 'metadata', playsInline: true });
    return place(element, item.rect);
  }
  if (item.kind === 'online') {
    const frame = document.createElement('iframe');
    Object.assign(frame, { src: embedUrl(item.url), allow: 'autoplay; fullscreen', title: 'Online video' });
    return place(frame, item.rect);
  }
  return place(notice(`Deze video (${item.name}) kan niet afspelen in de browser. Sla ze in PowerPoint op als mp4.`), item.rect);
}

export const isPlayable = (element) => element instanceof HTMLMediaElement;
