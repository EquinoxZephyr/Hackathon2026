import { DEFAULT_LANGUAGE } from '/shared/protocol.js';
import { startMicrophone } from './audio/microphone.js';

// Houdt alleen de tekst van de laatste minuten bij. Geluid wordt nooit bewaard.
export class TranscriptBuffer {
  #entries = [];

  constructor(windowMs) {
    this.windowMs = windowMs;
  }

  add(text, at = Date.now()) {
    const clean = text.trim();
    if (clean) this.#entries.push({ at, text: clean });
  }

  entries(now = Date.now()) {
    this.#entries = this.#entries.filter((entry) => entry.at >= now - this.windowMs);
    return [...this.#entries];
  }

  text() {
    return this.entries().map((entry) => entry.text).join(' ');
  }

  // Slideherkenning kijkt naar de laatste woorden, los van hoe snel er gesproken wordt.
  lastWords(count) {
    return this.text().split(/\s+/).slice(-count).join(' ');
  }
}

// Beide bronnen hebben dezelfde vorm: { start(), stop() }. Ze melden afgewerkte zinnen via onText,
// hun toestand via onStatus en (alleen de microfoon) woorden-in-wording via onInterim en het volume via onLevel.

const RESTART_DELAY_MS = 1_000;
const START_TIMEOUT_MS = 6_000;
const UNSUPPORTED = 'Spraakherkenning werkt niet in deze browser. Gebruik Google Chrome of Microsoft Edge.';
const NOT_RESPONDING = 'Spraakherkenning reageert niet. Gebruik Google Chrome of Microsoft Edge (niet Brave, Opera of Firefox) en kijk of je internet hebt.';

// Fouten waarbij opnieuw proberen niets oplost: we stoppen en zeggen wat de lector moet doen.
const FATAL_ERRORS = {
  'not-allowed': 'Microfoon: geen toegang. Klik op het slotje links in de adresbalk en sta de microfoon toe.',
  'service-not-allowed': UNSUPPORTED,
  'audio-capture': 'Microfoon: geen microfoon gevonden.',
  'language-not-supported': 'Spraakherkenning: Nederlands wordt niet ondersteund in deze browser.',
};
const NETWORK_ERROR = 'Spraakherkenning: geen verbinding met de spraakdienst. Chrome heeft hiervoor internet nodig; in Brave werkt dit niet.';
const PHRASE_BOOST = 5;

// Nieuwere Chrome-versies kunnen woorden voorrang geven (bv. Engelse vakwoorden van de slides).
// Andere browsers kennen dit niet: dan doen we gewoon zonder.
function applyPhrases(recognition, phrases) {
  if (!window.SpeechRecognitionPhrase || !('phrases' in recognition) || phrases.length === 0) return;
  try {
    recognition.phrases = phrases.map((phrase) => new window.SpeechRecognitionPhrase(phrase, PHRASE_BOOST));
  } catch (error) {
    console.warn('Vakwoorden doorgeven lukte niet:', error);
  }
}

export function createMicSource({ onText, onStatus, onInterim = () => {}, onLevel = () => {}, lang = DEFAULT_LANGUAGE, phrases = [] }) {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) throw new Error(UNSUPPORTED);

  const recognition = new Recognition();
  recognition.lang = lang;
  applyPhrases(recognition, phrases);
  recognition.continuous = true;
  recognition.interimResults = true;
  let active = false;
  let started = false;
  let microphone = null;
  let watchdog = null;
  const stopMicrophone = () => {
    microphone?.stop();
    microphone = null;
  };

  const startRecognition = () => {
    try {
      recognition.start();
    } catch (error) {
      // InvalidStateError = draait al; al de rest zeggen we aan de lector.
      if (error.name !== 'InvalidStateError') onStatus(`Spraakherkenning start niet: ${error.message}`);
    }
  };

  recognition.onstart = () => {
    started = true;
    clearTimeout(watchdog);
    onStatus('Spraakherkenning: luistert');
  };
  recognition.onspeechstart = () => onStatus('Spraakherkenning: hoort spraak');
  recognition.onspeechend = () => onStatus('Spraakherkenning: luistert');
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const { transcript } = event.results[i][0];
      if (event.results[i].isFinal) onText(transcript);
      else interim += transcript;
    }
    onInterim(interim);
  };
  recognition.onerror = (event) => {
    console.warn('Spraakherkenning:', event.error, event.message);
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    // Sommige versies kennen vakwoorden alleen bij herkenning op het toestel: dan zonder verder.
    if (event.error === 'phrases-not-supported') {
      recognition.phrases = [];
      return;
    }
    clearTimeout(watchdog);
    if (FATAL_ERRORS[event.error]) {
      active = false;
      stopMicrophone();
      onStatus(FATAL_ERRORS[event.error]);
    } else {
      onStatus(event.error === 'network' ? NETWORK_ERROR : `Spraakherkenning: fout (${event.error}), probeert opnieuw…`);
    }
  };
  // Chrome stopt na een stilte of na een tijd vanzelf; zolang de les loopt, starten we opnieuw.
  recognition.onend = () => {
    onInterim('');
    if (!active) return;
    setTimeout(() => {
      if (active) startRecognition();
    }, RESTART_DELAY_MS);
  };

  return {
    // De spraakherkenning start eerst en los van de microfoon-opname: die mag haar nooit tegenhouden.
    start() {
      active = true;
      onStatus('Spraakherkenning: starten…');
      startRecognition();
      watchdog = setTimeout(() => {
        if (active && !started) onStatus(NOT_RESPONDING);
      }, START_TIMEOUT_MS);

      startMicrophone(onLevel)
        .then((mic) => {
          if (active) microphone = mic;
          else mic.stop();
        })
        .catch((error) => {
          if (!started) onStatus(error.message);
        });
    },
    // Het geluid van de laatste seconden (wav), voor een meertalige les. Null als er niets is.
    recentAudio() {
      return microphone?.recentWav() ?? null;
    },
    // Andere taal tijdens de les: de herkenning stopt even en start vanzelf opnieuw in de nieuwe taal.
    setLanguage(newLang) {
      recognition.lang = newLang;
      if (active) recognition.abort();
    },
    stop() {
      active = false;
      clearTimeout(watchdog);
      stopMicrophone();
      recognition.stop();
      onStatus('Microfoon: gestopt');
    },
  };
}

// De demoles speelt een vaste tekst af en bedient zelf de presentatie: naar een slide gaan (`onSlide`)
// en de video op de slide starten (`onPlayMedia`), op de tijdstippen uit de demotekst.
export function createDemoSource({ transcript, cues = [] }, speed, { onText, onStatus, onSlide = () => {}, onPlayMedia = () => {} }) {
  let timers = [];
  const delay = (seconds) => (seconds * 1000) / speed;
  const at = (seconds, action) => setTimeout(action, delay(seconds));

  return {
    start() {
      onStatus(`Demoles speelt af (${speed}x)`);
      timers = [
        ...transcript.map((segment) => at(segment.t, () => onText(segment.text))),
        ...cues.map((cue) => at(cue.t, () => (cue.playMedia ? onPlayMedia() : onSlide(cue.slide)))),
        at(transcript.at(-1).t + 5, () => onStatus('Demoles afgelopen')),
      ];
    },
    stop() {
      timers.forEach(clearTimeout);
      timers = [];
      onStatus('Demoles gestopt');
    },
  };
}
