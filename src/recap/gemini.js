import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

const client = config.geminiApiKey ? new GoogleGenAI({ apiKey: config.geminiApiKey }) : null;
// Drie korte zinnen (±100 tokens) plus het verbeterde citaat (±80 tokens). Uitvoer is het duurste deel
// van een oproep, dus we houden het krap.
const REQUEST_CONFIG = { temperature: 0.2, maxOutputTokens: 280 };
const RETRY_DELAY_MS = 800;

// Fouten in ons verzoek (verkeerde sleutel, onbekend model…) lost opnieuw proberen niet op.
// Drukte bij Google (429/5xx) of een afgebroken stream wel.
const isRequestError = (error) => error.status >= 400 && error.status < 500 && error.status !== 429;

export const aiEnabled = Boolean(client);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Tekst alleen, of tekst plus een wav-fragment (meertalige les).
function request(prompt, audio) {
  const contents = audio
    ? [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'audio/wav', data: audio.toString('base64') } }] }]
    : prompt;
  return { model: config.geminiModel, contents, config: REQUEST_CONFIG };
}

function checked(text) {
  if (!text?.trim()) throw new Error('Leeg antwoord van het taalmodel');
  return text.trim();
}

async function streamOnce(prompt, audio, onText) {
  let text = '';
  for await (const chunk of await client.models.generateContentStream(request(prompt, audio))) {
    if (!chunk.text) continue;
    text += chunk.text;
    onText(text);
  }
  return checked(text);
}

async function generateOnce(prompt, audio, onText) {
  const text = checked((await client.models.generateContent(request(prompt, audio))).text);
  onText(text);
  return text;
}

// Streamt het antwoord: onText krijgt telkens de volledige tekst tot nu toe.
// De stream breekt bij Google soms halverwege af; dan vragen we het antwoord één keer opnieuw,
// in één stuk (zonder stream), want dat blijkt betrouwbaarder.
export async function streamText(prompt, audio, onText) {
  try {
    return await streamOnce(prompt, audio, onText);
  } catch (error) {
    if (isRequestError(error)) throw error;
    console.warn('Stream mislukt, opnieuw zonder stream:', error.message);
    await wait(RETRY_DELAY_MS);
    return generateOnce(prompt, audio, onText);
  }
}
