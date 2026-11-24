export function lastWords(text, count) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const tail = words.slice(-count).join(' ');
  return words.length > count ? `…${tail}` : tail;
}

export function clip(value, maxChars) {
  return typeof value === 'string' ? value.trim().slice(0, maxChars) : '';
}
