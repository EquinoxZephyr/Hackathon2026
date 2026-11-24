import { openZip } from './zip.js';

const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
};
const TITLE_TYPES = new Set(['title', 'ctrTitle']);
const NOTES_REL = /\/notesSlide$/;

// Wat een browser kan afspelen; andere formaten (wmv, avi…) tonen we als melding.
const PLAYABLE = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
};

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const first = (node, ns, tag) => node.getElementsByTagNameNS(NS[ns], tag)[0];

// Paden in een .pptx zijn relatief ten opzichte van het bestand dat ernaar verwijst.
const resolvePath = (from, target) => new URL(target, `https://pptx/${from}`).pathname.slice(1);
const relsPathFor = (path) => path.replace(/([^/]+)$/, '_rels/$1.rels');

async function readRelationships(zip, path) {
  const xml = await zip.text(relsPathFor(path));
  if (!xml) return new Map();
  return new Map(
    [...parseXml(xml).getElementsByTagName('Relationship')].map((rel) => {
      const external = rel.getAttribute('TargetMode') === 'External';
      const target = rel.getAttribute('Target');
      return [rel.getAttribute('Id'), { type: rel.getAttribute('Type'), external, target: external ? target : resolvePath(path, target) }];
    }),
  );
}

// Elke tekstvorm op een slide of notitiepagina: het soort plaatshouder en de alinea's.
function shapes(doc) {
  return [...doc.getElementsByTagNameNS(NS.p, 'sp')].map((shape) => ({
    type: first(shape, 'p', 'ph')?.getAttribute('type') ?? 'body',
    paragraphs: [...shape.getElementsByTagNameNS(NS.a, 'p')]
      .map((p) => [...p.getElementsByTagNameNS(NS.a, 't')].map((t) => t.textContent).join('').trim())
      .filter(Boolean),
  }));
}

// Plaats van een vorm als fractie van de slide (0–1), zodat ze op elke schermgrootte klopt.
// Altijd uit <a:xfrm> lezen: een echte PowerPoint bevat ook andere <a:ext>-elementen (extensies) zonder maten.
function placement(shape, slideSize) {
  const xfrm = first(shape, 'a', 'xfrm');
  const off = xfrm && first(xfrm, 'a', 'off');
  const ext = xfrm && first(xfrm, 'a', 'ext');
  if (!off || !ext) return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  const number = (node, attr) => Number(node.getAttribute(attr));
  return {
    x: number(off, 'x') / slideSize.cx,
    y: number(off, 'y') / slideSize.cy,
    w: number(ext, 'cx') / slideSize.cx,
    h: number(ext, 'cy') / slideSize.cy,
  };
}

// Video's en geluid op een slide. Ingesloten bestanden halen we uit de zip; online video's (YouTube…) blijven een link.
async function readMedia(zip, doc, rels, slideSize) {
  const media = [];
  for (const picture of doc.getElementsByTagNameNS(NS.p, 'pic')) {
    const file = first(picture, 'a', 'videoFile') ?? first(picture, 'a', 'audioFile');
    if (!file) continue;
    const kind = file.localName === 'videoFile' ? 'video' : 'audio';
    const rel = rels.get(first(picture, 'p14', 'media')?.getAttributeNS(NS.r, 'embed')) ?? rels.get(file.getAttributeNS(NS.r, 'link'));
    if (!rel) continue;

    const rect = placement(picture, slideSize);
    if (rel.external) {
      media.push({ kind: 'online', url: rel.target, rect });
      continue;
    }
    const extension = rel.target.split('.').pop().toLowerCase();
    const type = PLAYABLE[extension];
    media.push(type
      ? { kind, blob: await zip.blob(rel.target, type), rect }
      : { kind: 'unsupported', name: rel.target.split('/').pop(), rect });
  }
  return media;
}

// Null voor een verborgen slide: die staat ook niet in de pdf-export, zo lopen beide lijsten gelijk.
async function readSlide(zip, path, number, slideSize) {
  const doc = parseXml(await zip.text(path));
  if (doc.documentElement.getAttribute('show') === '0') return null;
  const rels = await readRelationships(zip, path);
  const slideShapes = shapes(doc);
  const title = slideShapes.filter((s) => TITLE_TYPES.has(s.type)).flatMap((s) => s.paragraphs).join(' ');
  const body = slideShapes.filter((s) => !TITLE_TYPES.has(s.type)).flatMap((s) => s.paragraphs);

  // Sprekersnotities: de lector ziet ze in de presentatieweergave, en ze zijn nuttige context voor de AI.
  const notesPath = [...rels.values()].find((rel) => NOTES_REL.test(rel.type))?.target;
  const notes = notesPath
    ? shapes(parseXml(await zip.text(notesPath))).filter((s) => s.type === 'body').flatMap((s) => s.paragraphs)
    : [];

  return {
    title: title || body.shift() || `Slide ${number}`,
    text: body.join(' '),
    notes: notes.join('\n'),
    media: await readMedia(zip, doc, rels, slideSize),
  };
}

export async function readPptxSlides(file) {
  const zip = openZip(await file.arrayBuffer());
  const presentationXml = await zip.text('ppt/presentation.xml');
  if (!presentationXml) throw new Error('Dit is geen geldig PowerPoint-bestand.');
  const presentation = parseXml(presentationXml);
  const size = first(presentation, 'p', 'sldSz');
  const slideSize = { cx: Number(size?.getAttribute('cx')) || 12192000, cy: Number(size?.getAttribute('cy')) || 6858000 };

  // De volgorde staat in presentation.xml, niet in de bestandsnamen.
  const rels = await readRelationships(zip, 'ppt/presentation.xml');
  const slidePaths = [...presentation.getElementsByTagNameNS(NS.p, 'sldId')]
    .map((slide) => rels.get(slide.getAttributeNS(NS.r, 'id'))?.target)
    .filter(Boolean);

  const slides = [];
  for (const path of slidePaths) {
    const slide = await readSlide(zip, path, slides.length + 1, slideSize);
    if (slide) slides.push(slide);
  }
  return slides;
}
