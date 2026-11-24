import { LANGUAGES, LIMITS } from '../../shared/protocol.js';

// Scheidt in het antwoord het citaat (eerst) van de uitleg (daarna).
export const QUOTE_SEPARATOR = '---';

const UNSURE = 'Wat je niet met zekerheid verstaat, schrijf je als "…". Bouw nooit een zin uit klanken die je niet begrijpt: liever "…" dan een gok.';

// Het model schrijft eerst het citaat dat de student te zien krijgt, en legt daarna uit op basis daarvan.
// Eerst citeren, dan uitleggen: zo neemt de uitleg de juiste vaktermen over.
// - Met geluid (meertalige les) komt het citaat rechtstreeks uit de opname: actueler en juister dan het transcript.
// - Zonder geluid verbetert het model het `snippet` (laatste stuk van het transcript).
// - Zonder beide is er geen citaat, alleen uitleg.
// Geeft de prompt terug, en of het antwoord een citaat bevat.
export function buildRecapPrompt(slide, transcript, { language, withAudio, snippet }) {
  const languageName = LANGUAGES[language];
  const quoteStep = withAudio
    ? `Stap 1: schrijf de laatste zinnen uit de geluidsopname woord voor woord op (hoogstens ${LIMITS.SNIPPET_WORDS} woorden), in de taal waarin de lector ze zei. Vertaal niets en voeg niets toe. ${UNSURE}`
    : snippet
      ? `Stap 1: schrijf het fragment onderaan opnieuw zoals de lector het echt zei. Verbeter verkeerd gehoorde woorden, vertaal niets (Engels blijft Engels, Frans blijft Frans) en voeg niets toe. ${UNSURE}`
      : null;
  const explain = [
    `Leg in maximaal 3 korte zinnen in eenvoudig ${languageName} uit wat de lector net uitlegde.`,
    'Gebruik de vaktermen van de lector, correct gespeld en in de taal waarin hij ze zei. Vervang een vakterm nooit door een omschrijving.',
    'Vertel alleen wat de lector echt gezegd heeft, en alleen wat je met zekerheid verstaan hebt. De slide en de notities zijn achtergrond: beweer nooit dat de lector iets zei dat alleen in de notities staat.',
    'Verzin niets. Geen inleiding, geen opsomming, geen opmaak (geen sterretjes of hekjes).',
  ];

  const prompt = [
    'Je helpt een student die tijdens een les de draad kwijt is.',
    `Het transcript komt van spraakherkenning die enkel ${languageName} verwacht. Lectoren gebruiken vaak woorden en zinnen uit een andere taal (meestal Engels of Frans). Die staan in het transcript fonetisch geschreven of als bestaande woorden die ongeveer hetzelfde klinken, maar in de zin geen betekenis hebben. Lees zulke stukken hardop in je hoofd en herken wat de lector echt zei, met de context van het vak.`,
    'Woorden die in de zin wél kloppen, verander je niet.',
    ...(withAudio
      ? [`Je krijgt ook een geluidsopname van de laatste ${LIMITS.AUDIO_SECONDS} seconden. Daarin kan de lector ook een andere taal spreken. Verschillen de opname en het transcript, vertrouw dan op de opname.`]
      : []),
    '',
    ...(quoteStep
      ? [quoteStep, `Stap 2: schrijf een regel met enkel "${QUOTE_SEPARATOR}".`, 'Stap 3: de uitleg, gebaseerd op wat je in stap 1 schreef en op het transcript.', ...explain]
      : explain),
    '',
    `Slide: ${slide.title}`,
    slide.text,
    ...(slide.notes ? ['', 'Notities van de lector (achtergrond, niet per se gezegd):', slide.notes] : []),
    '',
    'Transcript van de laatste 2 minuten:',
    transcript || '(geen transcript beschikbaar)',
    ...(quoteStep && !withAudio ? ['', 'Fragment om te verbeteren:', snippet] : []),
  ].join('\n');

  return { prompt, withQuote: Boolean(quoteStep) };
}
