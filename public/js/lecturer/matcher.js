// Zoekt welke slide past bij wat de lector net zei. Draait volledig in de browser van de lector.
// Tot het lokale AI-model geladen is (of als dat niet lukt) gebruiken we trefwoorden.

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';
const MODEL = 'Xenova/multilingual-e5-small';

const STOPWORDS = new Set(
  'de het een en van in op te dat die is zijn voor met als aan er maar om ook dan wat dus nog bij uit door naar over je we wij ze zij hij ik u dit deze niet wel geen kan kun kunnen moet moeten wordt worden werd was waren heeft hebben had al nu zo heel eigenlijk gewoon even'.split(' '),
);

function tokenize(text) {
  const words = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? [];
  return words.filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function argmax(values) {
  return values.reduce((best, value, index) => (value > values[best] ? index : best), 0);
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function buildKeywordIndex(documents) {
  const slideWords = documents.map((doc) => new Set(tokenize(doc)));
  const documentFrequency = new Map();
  for (const words of slideWords) {
    for (const word of words) documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
  }
  const idf = (word) => Math.log(1 + documents.length / (documentFrequency.get(word) ?? documents.length));
  return { slideWords, idf };
}

function keywordScores({ slideWords, idf }, text) {
  const query = new Set(tokenize(text));
  return slideWords.map((words) => [...query].reduce((sum, word) => sum + (words.has(word) ? idf(word) : 0), 0));
}

export class SlideMatcher {
  #documents;
  #keywords;
  #embed = null;
  #slideVectors = null;

  constructor(slides, onStatus) {
    this.#documents = slides.map((slide) => `${slide.title}. ${slide.text}`);
    this.#keywords = buildKeywordIndex(this.#documents);
    this.onStatus = onStatus;
  }

  async load() {
    this.onStatus('Slideherkenning: trefwoorden (AI-model laadt…)');
    try {
      const { pipeline } = await import(TRANSFORMERS_URL);
      const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
      const embed = async (texts) => (await extractor(texts, { pooling: 'mean', normalize: true })).tolist();
      this.#slideVectors = await embed(this.#documents.map((doc) => `passage: ${doc}`));
      this.#embed = embed;
      this.onStatus('Slideherkenning: lokale embeddings');
    } catch (error) {
      console.warn('Embeddingmodel niet geladen:', error);
      this.onStatus('Slideherkenning: trefwoorden (AI-model niet beschikbaar)');
    }
  }

  async match(text, currentIndex) {
    const scores = this.#embed ? await this.#embeddingScores(text) : keywordScores(this.#keywords, text);
    const best = argmax(scores);
    return scores[best] > 0 ? best : currentIndex;
  }

  async #embeddingScores(text) {
    const [query] = await this.#embed([`query: ${text}`]);
    return this.#slideVectors.map((vector) => dot(query, vector));
  }
}
