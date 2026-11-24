// pdf.js wordt maar één keer geladen, en alleen wanneer er een pdf nodig is.
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

let loading = null;

function loadPdfJs() {
  loading ??= import(PDFJS_URL).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return pdfjs;
  });
  return loading;
}

// pdf.js neemt de buffer over; daarom krijgt het een kopie en blijft het origineel bruikbaar (bv. voor de beamer).
export async function openPdf(data) {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ data: data.slice(0) }).promise;
}
