import { readPdf } from './pdf.js';
import { readPptxSlides } from './pptx.js';

const MAX_TERMS = 100;
const MAX_TITLE_TERM_CHARS = 60;
const TITLE_WEIGHT = 3;

const extensionOf = (file) => file.name.split('.').pop().toLowerCase();

// De woorden die het vaakst op de slides staan, plus de titels: vakwoorden die de spraakherkenning
// moet verwachten, ook als ze Engels of Frans zijn in een Nederlandstalige les.
export function keyTerms(slides) {
  const weights = new Map();
  const add = (term, weight) => weights.set(term, (weights.get(term) ?? 0) + weight);
  for (const { title, text, notes = '' } of slides) {
    if (title.length <= MAX_TITLE_TERM_CHARS) add(title, TITLE_WEIGHT);
    for (const word of `${title} ${text} ${notes}`.match(/\p{L}[\p{L}\p{N}-]{3,}/gu) ?? []) add(word.toLowerCase(), 1);
  }
  return [...weights]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TERMS)
    .map(([term]) => term);
}

// Wat de server krijgt: titel, tekst en (apart) de sprekersnotities. Apart, zodat de AI weet dat notities
// achtergrond zijn en niet per se gezegd werden. Video's en andere bestanden blijven op de laptop.
export const slidesForServer = (slides) =>
  slides.map(({ title, text, notes = '' }) => ({ title, text, notes }));

export async function loadDemoLecture() {
  const response = await fetch('/demo/lecture.json');
  if (!response.ok) throw new Error('De demoles kon niet geladen worden.');
  return response.json();
}

// Een presentatie uit één of twee bestanden:
// - .pdf (hoofdbestand): hoe de slides eruitzien; met een pdf presenteert de lector vanuit Frank
// - .pptx (optioneel): notities en video's (de slides zelf kan een browser niet tonen)
export async function loadPresentation(files) {
  const byType = Object.groupBy([...files], extensionOf);
  if (byType.ppt) {
    throw new Error('Oudere .ppt-bestanden worden niet ondersteund. Open de presentatie in PowerPoint en sla ze op als .pptx.');
  }
  const pptxFile = byType.pptx?.[0];
  const pdfFile = byType.pdf?.[0];
  if (!pptxFile && !pdfFile) throw new Error('Kies eerst je slides als pdf.');

  const [pptxSlides, pdf] = await Promise.all([
    pptxFile ? readPptxSlides(pptxFile) : null,
    pdfFile ? readPdf(pdfFile) : null,
  ]);
  if (pptxSlides && pdf && pptxSlides.length !== pdf.slides.length) {
    throw new Error(`De pdf heeft ${pdf.slides.length} pagina's en de PowerPoint ${pptxSlides.length} slides. Exporteer de pdf opnieuw vanuit deze PowerPoint.`);
  }

  const slides = pptxSlides ?? pdf.slides;
  if (slides.length === 0) throw new Error('Deze presentatie heeft geen slides.');
  if (!pdf && slides.every((slide) => !slide.text && !slide.notes)) {
    throw new Error('Er staat geen leesbare tekst in deze slides.');
  }
  return { slides, pdf: pdf && { document: pdf.document, data: pdf.data } };
}
