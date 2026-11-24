// Gedeeld tussen server en browser: eventnamen, limieten en talen op één plek.

export const EVENTS = Object.freeze({
  SESSION_CREATE: 'session:create',
  SESSION_RESUME: 'session:resume',
  SESSION_END: 'session:end',
  SESSION_ENDED: 'session:ended',
  SESSION_JOIN: 'session:join',
  SETTINGS_UPDATE: 'settings:update',
  CONTEXT_UPDATE: 'context:update',
  AUDIO_REQUEST: 'audio:request',
  STATS: 'stats',
  ALERT: 'alert',
  TAP: 'tap',
  RECAP_UPDATE: 'recap:update',
  FEEDBACK: 'feedback',
  SIMULATE: 'simulate',
});

export const LIMITS = Object.freeze({
  TRANSCRIPT_WINDOW_MS: 120_000,
  MATCH_WORDS: 60,
  CONTEXT_PUSH_MS: 5_000,
  MOMENT_WINDOW_MS: 60_000,
  PEAK_WINDOW_MS: 30_000,
  PEAK_SHARE: 0.15,
  PEAK_MIN_TAPS: 3,
  ALERT_COOLDOWN_MS: 60_000,
  TAP_COOLDOWN_MS: 20_000,
  MAX_TAPS_PER_STUDENT: 10,
  MAX_SLIDES: 150,
  MAX_TITLE_CHARS: 120,
  MAX_SLIDE_CHARS: 2_000,
  MAX_TRANSCRIPT_CHARS: 4_000,
  SNIPPET_WORDS: 40,
  DEMO_AUDIENCE: 30,
  SIM_CONFUSED: 8,
  SIM_SPREAD_MS: 8_000,
  // Meertalige les: hoeveel geluid er bij een tik meegaat, en hoe lang de server erop wacht.
  AUDIO_SECONDS: 30,
  AUDIO_SAMPLE_RATE: 16_000,
  AUDIO_REQUEST_TIMEOUT_MS: 4_000,
  MAX_AUDIO_BYTES: 2_000_000,
});

// Talen van de spraakherkenning, met de naam zoals de lector en het taalmodel ze lezen.
export const LANGUAGES = Object.freeze({
  'nl-BE': 'Nederlands',
  'en-GB': 'Engels',
  'fr-BE': 'Frans',
  'de-DE': 'Duits',
});
export const DEFAULT_LANGUAGE = 'nl-BE';
