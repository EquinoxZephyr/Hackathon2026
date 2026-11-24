import { DEFAULT_LANGUAGE, EVENTS, LANGUAGES, LIMITS } from '/shared/protocol.js';
import { $, el, showOnly } from '../shared/dom.js';
import { onReconnect, request, socket } from '../shared/realtime.js';
import { announce, requestNotificationPermission, setupLoudAlerts } from './loudAlerts.js';
import { SlideMatcher } from './matcher.js';
import { Presenter } from './presenter.js';
import { keyTerms, loadDemoLecture, loadPresentation, slidesForServer } from './slides/index.js';
import { createDemoSource, createMicSource, TranscriptBuffer } from './transcript.js';
import * as view from './view.js';

const screens = { setup: $('#setup'), live: $('#live'), overview: $('#overview') };
const buffer = new TranscriptBuffer(LIMITS.TRANSCRIPT_WINDOW_MS);
const lesson = { session: null, slides: [], slideIndex: 0, startedAt: 0, matcher: null, presenter: null, source: null, timer: null };

// Hoofdtaal en meertalige les: de server heeft ze nodig om de uitleg te maken.
const settings = () => ({ language: $('#language').value, multilingual: $('#multilingual').checked });

$('#language').replaceChildren(
  ...Object.entries(LANGUAGES).map(([code, name]) => el('option', { value: code }, name)),
);
$('#language').value = DEFAULT_LANGUAGE;

// Met een pdf presenteert de lector vanuit Frank en weten we exact welke slide er getoond wordt.
// Zonder pdf leiden we de slide af uit wat de lector zegt (en zeggen we bij een eigen les waarom er geen slides zijn).
function trackSlides(slides, pdf, join, demo) {
  $('#no-preview').hidden = Boolean(pdf) || demo;
  if (pdf) {
    $('#live').classList.add('presenting');
    $('#stage').hidden = false;
    lesson.presenter = new Presenter({
      pdf,
      slides,
      join,
      onSlideChange: (index) => {
        lesson.slideIndex = index;
        view.renderSlide(slides[index], index, slides.length);
        pushContext();
      },
    });
  } else {
    lesson.matcher = new SlideMatcher(slides, view.setMatcherStatus);
    lesson.matcher.load();
  }
}

async function startLesson(slides, { demo, createSource, pdf = null }) {
  const session = await request(EVENTS.SESSION_CREATE, { slides: slidesForServer(slides), demo, settings: settings() });
  Object.assign(lesson, { session, slides, slideIndex: 0, startedAt: Date.now() });

  view.renderSession(session);
  view.renderStats(session.stats);
  view.renderSlide(slides[0], 0, slides.length);
  showOnly(Object.values(screens), screens.live);
  $('#live-actions').hidden = false;
  trackSlides(slides, pdf, { qr: session.qr, code: session.code, joinUrl: session.joinUrl }, demo);

  lesson.source = createSource({
    onText: (text) => {
      buffer.add(text);
      view.renderTranscript(buffer.entries(), lesson.startedAt);
    },
    onInterim: view.renderInterim,
    onLevel: view.renderMicLevel,
    onStatus: view.setSourceStatus,
  });
  lesson.source.start();
  lesson.timer = setInterval(pushContext, LIMITS.CONTEXT_PUSH_MS);
  pushContext();
}

// Stuurt het transcript en de herkende slide naar de server, zodat een tik meteen context heeft.
async function pushContext() {
  const recent = buffer.lastWords(LIMITS.MATCH_WORDS);
  if (lesson.matcher && recent) lesson.slideIndex = await lesson.matcher.match(recent, lesson.slideIndex);
  view.renderSlide(lesson.slides[lesson.slideIndex], lesson.slideIndex, lesson.slides.length);
  socket.emit(EVENTS.CONTEXT_UPDATE, { transcript: buffer.text(), slideIndex: lesson.slideIndex });
}

async function endLesson() {
  lesson.source.stop();
  lesson.presenter?.end();
  clearInterval(lesson.timer);
  $('#live-actions').hidden = true;
  view.renderOverview(await request(EVENTS.SESSION_END));
  showOnly(Object.values(screens), screens.overview);
}

async function withSetupErrors(action) {
  requestNotificationPermission();
  const error = $('#setup-error');
  error.hidden = true;
  try {
    await action();
  } catch (err) {
    error.textContent = err.message === 'timeout' ? 'De server antwoordt niet. Probeer het opnieuw.' : err.message;
    error.hidden = false;
  }
}

$('#start-demo').addEventListener('click', () =>
  withSetupErrors(async () => {
    const lecture = await loadDemoLecture();
    const speed = Number($('#demo-speed').value);
    await startLesson(lecture.slides, {
      demo: true,
      createSource: (handlers) => createDemoSource(lecture.transcript, speed, handlers),
    });
  }),
);

// De pdf is het hoofdbestand (zo ziet de slide eruit); de PowerPoint is optioneel en levert notities en video's.
// Na het kiezen vervangt een korte status de uitleg op de kaart, zodat de kaart even hoog blijft.
const chosenFiles = () => [...$('#pdf-file').files, ...$('#pptx-file').files];
const helpLink = () => el('button', { type: 'button', class: 'link-button', 'data-pdf-help': '' }, 'Hoe maak ik een pdf?');
const defaultHint = [...$('#slides-hint').childNodes];

// Het gekozen bestand staat op de knop zelf (ingekort met … als de naam lang is).
function renderPickedFile(input) {
  const label = input.nextElementSibling;
  label.dataset.empty ??= label.textContent;
  const file = input.files[0];
  label.textContent = file ? `✓ ${file.name}` : label.dataset.empty;
  label.title = file?.name ?? '';
}

function renderPickStatus(event) {
  renderPickedFile(event.target);
  const pdf = $('#pdf-file').files[0];
  const pptx = $('#pptx-file').files[0];
  const hint = $('#slides-hint');
  hint.classList.toggle('is-warning', Boolean(pptx && !pdf));
  if (pdf && pptx) hint.replaceChildren('Klaar: je slides, notities en video\'s staan klaar.');
  else if (pdf) hint.replaceChildren('Klaar. Heeft je presentatie video\'s of notities? Voeg dan je PowerPoint toe.');
  else if (pptx) hint.replaceChildren('Zonder pdf worden je slides niet getoond. Kies ook je slides als pdf. ', helpLink());
  else hint.replaceChildren(...defaultHint);
}

$('#pdf-file').addEventListener('change', renderPickStatus);
$('#pptx-file').addEventListener('change', renderPickStatus);
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-pdf-help]')) $('#pdf-help').showModal();
});

function startOwnLesson() {
  withSetupErrors(async () => {
    const { slides, pdf } = await loadPresentation(chosenFiles());
    const phrases = keyTerms(slides);
    await startLesson(slides, {
      demo: false,
      pdf,
      createSource: (handlers) => createMicSource({ ...handlers, lang: $('#language').value, phrases }),
    });
    $('#lesson-settings').hidden = false;
  });
}

// Met alleen een pdf vragen we eerst of de lector de PowerPoint wil toevoegen: anders spelen video's niet af.
$('#start-own').addEventListener('submit', (event) => {
  event.preventDefault();
  const onlyPdf = $('#pdf-file').files.length > 0 && $('#pptx-file').files.length === 0;
  if (onlyPdf) $('#pdf-only').showModal();
  else startOwnLesson();
});

$('#add-pptx').addEventListener('click', () => {
  $('#pdf-only').close();
  $('#pptx-file').click();
});
$('#start-without-pptx').addEventListener('click', () => {
  $('#pdf-only').close();
  startOwnLesson();
});

$('#language').addEventListener('change', (event) => {
  lesson.source?.setLanguage?.(event.target.value);
  socket.emit(EVENTS.SETTINGS_UPDATE, settings());
});
$('#multilingual').addEventListener('change', () => socket.emit(EVENTS.SETTINGS_UPDATE, settings()));
$('#simulate').addEventListener('click', () => socket.emit(EVENTS.SIMULATE));
$('#end').addEventListener('click', () => endLesson().catch(console.error));

// Bij een tik in een meertalige les vraagt de server de laatste seconden geluid op.
socket.on(EVENTS.AUDIO_REQUEST, (ack) => ack(lesson.source?.recentAudio?.() ?? null));
socket.on(EVENTS.STATS, view.renderStats);
socket.on(EVENTS.ALERT, (alert) => {
  view.showAlert(alert);
  announce(alert);
});
setupLoudAlerts();
onReconnect(() => {
  if (lesson.session) socket.emit(EVENTS.SESSION_RESUME, { code: lesson.session.code, lecturerKey: lesson.session.lecturerKey });
});
