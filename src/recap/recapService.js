import { LIMITS } from '../../shared/protocol.js';
import { lastWords } from '../util/text.js';
import { aiEnabled, streamText } from './gemini.js';
import { buildRecapPrompt, QUOTE_SEPARATOR } from './prompt.js';

const OFFLINE_CHARS = 300;
const SEPARATOR_LINE = new RegExp(`^\\s*${QUOTE_SEPARATOR}\\s*$`, 'm');

// Het scherm toont gewone tekst: opmaaktekens die het model toch meestuurt, halen we weg.
const plainText = (text) => text.replace(/[*#]/g, '');

// Met een fragment is het antwoord: het verbeterde citaat, een regel "---", en dan de uitleg.
// Zolang de scheidingslijn er nog niet is, is er nog geen uitleg om te tonen. Zonder fragment is alles uitleg.
function splitAnswer(raw, withQuote) {
  if (!withQuote) return { text: plainText(raw).trim(), quote: '' };
  const [quote, ...rest] = raw.split(SEPARATOR_LINE);
  return {
    text: plainText(rest.join(' ')).trim(),
    quote: rest.length ? plainText(quote).trim().replace(/^["“”]+|["“”]+$/g, '') : '',
  };
}

function offlineRecap(slide) {
  return { text: `Deze slide gaat over "${slide.title}". ${slide.text}`.trim().slice(0, OFFLINE_CHARS), source: 'offline' };
}

// Start de uitleg voor één moment. Het object groeit mee terwijl de tekst binnenstroomt;
// `publish` wordt bij elke stap opgeroepen zodat wachtende studenten meelezen.
// `fetchAudio` haalt bij een meertalige les het geluid van de laatste seconden op bij de lector.
function startRecap(session, key, { publish, fetchAudio }) {
  const slide = session.currentSlide;
  const { transcript } = session.context;
  const { language, multilingual } = session.settings;
  const recap = {
    id: key,
    slideTitle: slide.title,
    snippet: lastWords(transcript, LIMITS.SNIPPET_WORDS),
    snippetCorrected: false,
    text: '',
    source: 'ai',
    usedAudio: false,
    done: false,
  };
  const finish = (fields) => {
    Object.assign(recap, fields, { done: true });
    publish(recap);
  };

  if (!aiEnabled) {
    finish(offlineRecap(slide));
    return recap;
  }

  session.aiCalls += 1;
  const startedAt = Date.now();
  let firstTextMs = null;
  let withQuote = false;
  const generate = async () => {
    const audio = multilingual ? await fetchAudio() : null;
    recap.usedAudio = Boolean(audio);
    const request = buildRecapPrompt(slide, transcript, { language, withAudio: recap.usedAudio, snippet: recap.snippet });
    withQuote = request.withQuote;
    return streamText(request.prompt, audio, (answer) => {
      const { text } = splitAnswer(answer, withQuote);
      if (!text) return;
      firstTextMs ??= Date.now() - startedAt;
      recap.text = text;
      publish(recap);
    });
  };

  generate()
    .then((answer) => {
      const withAudio = recap.usedAudio ? ' (met geluid)' : '';
      console.log(`Uitleg "${slide.title}"${withAudio}: eerste uitleg na ${firstTextMs} ms, klaar na ${Date.now() - startedAt} ms`);
      const { text, quote } = splitAnswer(answer, withQuote);
      finish(quote ? { text, snippet: quote, snippetCorrected: true } : { text: text || plainText(answer).trim() });
    })
    .catch((error) => {
      console.error('Taalmodel-oproep mislukt:', error.message);
      session.recaps.delete(key);
      finish(offlineRecap(slide));
    });
  return recap;
}

// Eén uitleg per moment: wie later tikt, of tegelijk terwijl de tekst nog binnenkomt, krijgt dezelfde.
export function getRecap(session, now, sources) {
  const key = session.momentKey(now);
  if (!session.recaps.has(key)) session.recaps.set(key, startRecap(session, key, sources));
  return session.recaps.get(key);
}
