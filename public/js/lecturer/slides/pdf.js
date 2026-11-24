import { openPdf } from '../../presentation/pdfjs.js';

// Leest een pdf: per pagina de tekst (eerste regel = titel), plus het document zelf om te tonen.
export async function readPdf(file) {
  const data = await file.arrayBuffer();
  const document = await openPdf(data);
  const slides = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const { items } = await (await document.getPage(pageNumber)).getTextContent();
    const lines = items.map((item) => item.str.trim()).filter(Boolean);
    slides.push({ title: lines[0] ?? `Slide ${pageNumber}`, text: lines.slice(1).join(' '), notes: '', media: [] });
  }
  return { slides, document, data };
}
