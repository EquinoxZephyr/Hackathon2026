// Tekent één slide uit de pdf als jpg (data-URL), om als voorbeeld naar de studenten te sturen.
import { LIMITS } from '/shared/protocol.js';

export async function renderSlideImage(document, index) {
  const page = await document.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: LIMITS.SLIDE_IMAGE_WIDTH / base.width });
  const canvas = Object.assign(window.document.createElement('canvas'), { width: viewport.width, height: viewport.height });
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  // intent 'print': zie slideView.js, werkt ook als het venster niet zichtbaar is.
  await page.render({ canvasContext: context, viewport, intent: 'print' }).promise;
  return canvas.toDataURL('image/jpeg', LIMITS.SLIDE_IMAGE_QUALITY);
}
