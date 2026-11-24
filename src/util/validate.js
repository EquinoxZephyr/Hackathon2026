import { DEFAULT_LANGUAGE, LANGUAGES, LIMITS } from '../../shared/protocol.js';
import { clip } from './text.js';

export function sanitizeSlides(input) {
  if (!Array.isArray(input) || input.length === 0) return null;
  return input.slice(0, LIMITS.MAX_SLIDES).map((slide, index) => ({
    title: clip(slide?.title, LIMITS.MAX_TITLE_CHARS) || `Slide ${index + 1}`,
    text: clip(slide?.text, LIMITS.MAX_SLIDE_CHARS),
    notes: clip(slide?.notes, LIMITS.MAX_SLIDE_CHARS),
  }));
}

export function sanitizeSettings(input) {
  return {
    language: Object.hasOwn(LANGUAGES, input?.language) ? input.language : DEFAULT_LANGUAGE,
    multilingual: input?.multilingual === true,
  };
}

// Geluid van de lector: alleen een wav-bestand van redelijke grootte.
export function sanitizeAudio(value) {
  if (!Buffer.isBuffer(value) || value.length < 44 || value.length > LIMITS.MAX_AUDIO_BYTES) return null;
  return value.toString('ascii', 0, 4) === 'RIFF' && value.toString('ascii', 8, 12) === 'WAVE' ? value : null;
}

// Voorbeeld van de huidige slide: enkel een jpg als data-URL, niet groter dan nodig.
export function sanitizeSlideImage(payload, slideCount) {
  const { index, image } = payload ?? {};
  const valid = Number.isInteger(index) && index >= 0 && index < slideCount
    && typeof image === 'string' && image.startsWith('data:image/jpeg;base64,') && image.length <= LIMITS.MAX_SLIDE_IMAGE_CHARS;
  return valid ? { index, image } : null;
}

export function sanitizeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(value) ? value : null;
}
