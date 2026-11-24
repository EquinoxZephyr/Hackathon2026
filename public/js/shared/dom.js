export const $ = (selector, root = document) => root.querySelector(selector);

export function showOnly(screens, active) {
  for (const screen of screens) screen.hidden = screen !== active;
}

export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

export function formatClock(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function renderFigures(container, figures) {
  container.replaceChildren(
    ...figures.map(({ label, value }) => el('div', { class: 'figure' }, el('strong', {}, String(value)), el('span', {}, label))),
  );
}
