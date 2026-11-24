import { EVENTS, LIMITS } from '/shared/protocol.js';
import { $, showOnly } from '../shared/dom.js';
import { onReconnect, request, socket } from '../shared/realtime.js';

const MESSAGES = {
  'no-session': 'Deze les bestaat niet (meer). Kijk de code na.',
  cooldown: 'Je hebt net getikt. Wacht even voor je opnieuw tikt.',
  limit: 'Je hebt het maximum aantal tikken voor deze les bereikt.',
  timeout: 'De server antwoordt niet. Probeer het opnieuw.',
};
const messageFor = (error) => MESSAGES[error.message] ?? 'Er ging iets mis. Probeer het opnieuw.';
// Op een pc (muis) noemen we ook de spatiebalk; op een gsm niet.
const ON_PC = window.matchMedia('(pointer: fine)').matches;
const HINT = ON_PC
  ? 'Klik op de munt of druk op de spatiebalk als je de draad kwijt bent. Niemand ziet wie er tikt.'
  : 'Tik op de munt als je de draad kwijt bent. Niemand ziet wie er tikt.';

const screens = { join: $('#join'), lesson: $('#lesson'), ended: $('#ended') };
const tapButton = $('#tap');
const tapLabel = $('#tap-label');
const tapLabelText = tapLabel.textContent;
let joinedCode = null;
let currentRecapId = null;

function studentId() {
  const key = 'frank-student-id';
  const fresh = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    const id = localStorage.getItem(key) ?? fresh();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return fresh();
  }
}
const myId = studentId();

// De slide die de lector nu toont (alleen als de lector presenteert met slides).
function showSlide(slideImage) {
  if (!slideImage) return;
  $('#slide-image').src = slideImage.image;
  $('#slide-full-image').src = slideImage.image;
  $('#slide-caption').textContent = `Nu op het scherm: slide ${slideImage.index + 1}`;
  $('#slide-preview').hidden = false;
  $('#lesson').classList.add('with-slide');
}

async function join(code) {
  const { code: confirmed, slideImage } = await request(EVENTS.SESSION_JOIN, { code: code.trim().toUpperCase(), studentId: myId });
  joinedCode = confirmed;
  showSlide(slideImage);
  history.replaceState(null, '', `?code=${confirmed}`);
  $('#lesson-code').textContent = `Les ${confirmed}`;
  showOnly(Object.values(screens), screens.lesson);
}

function setStatus(text) {
  $('#tap-status').textContent = text;
}

// Toont de uitleg zoals ze nu is. Zolang `done` false is, stroomt er nog tekst binnen.
const SOURCE_TEXT = {
  audio: 'Gemaakt door AI op basis van de slide en het geluid van de les.',
  ai: 'Gemaakt door AI op basis van de slide en wat er gezegd werd.',
  offline: 'Tekst van de slide. De AI was even niet bereikbaar.',
};

function renderRecap({ slideTitle = '', snippet = '', snippetCorrected = false, text = '', source = 'ai', usedAudio = false, done = false } = {}) {
  $('#snippet-label').textContent = snippetCorrected
    ? 'Wat er net gezegd werd (verbeterd door AI)'
    : 'Wat er net gezegd werd';
  $('#recap').hidden = false;
  $('#recap').classList.toggle('is-streaming', !done);
  $('#recap-slide').textContent = slideTitle || '…';
  $('#recap-text').textContent = text || (done ? '' : 'Uitleg wordt gemaakt');
  $('#recap-snippet').textContent = snippet ? `"${snippet}"` : 'Er was nog geen transcript.';
  $('#recap-source').textContent = done ? SOURCE_TEXT[usedAudio && source === 'ai' ? 'audio' : source] : '';
  $('#feedback').hidden = !done;
  $('#feedback-thanks').hidden = true;
}

function cooldown() {
  const until = Date.now() + LIMITS.TAP_COOLDOWN_MS;
  const tick = () => {
    const seconds = Math.ceil((until - Date.now()) / 1000);
    if (seconds <= 0) {
      tapButton.disabled = false;
      tapLabel.textContent = tapLabelText;
      setStatus(HINT);
      return;
    }
    tapLabel.textContent = `Opnieuw over ${seconds} s`;
    setTimeout(tick, 250);
  };
  tapButton.disabled = true;
  tick();
}

async function tap() {
  tapButton.disabled = true;
  currentRecapId = null;
  renderRecap();
  setStatus('');
  try {
    const { recap } = await request(EVENTS.TAP);
    currentRecapId = recap.id;
    renderRecap(recap);
    cooldown();
  } catch (error) {
    $('#recap').hidden = true;
    setStatus(messageFor(error));
    if (error.message === 'cooldown') cooldown();
    else tapButton.disabled = error.message === 'limit';
  }
}

function sendFeedback(clear) {
  socket.emit(EVENTS.FEEDBACK, { clear });
  $('#feedback').hidden = true;
  $('#feedback-thanks').hidden = false;
}

$('#join-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#join-error').hidden = true;
  try {
    await join($('#code-input').value);
  } catch (error) {
    $('#join-error').textContent = messageFor(error);
    $('#join-error').hidden = false;
  }
});

tapButton.addEventListener('click', tap);

// Spatiebalk = "ik volg het niet meer", zolang je niet in een veld typt of de slide vergroot bekijkt.
document.addEventListener('keydown', (event) => {
  const typing = event.target.closest('input, textarea, select, button');
  if (event.key !== ' ' || typing || screens.lesson.hidden || $('#slide-full').open) return;
  event.preventDefault();
  if (!tapButton.disabled) tap();
});
$('#clear').addEventListener('click', () => sendFeedback(true));
$('#unclear').addEventListener('click', () => sendFeedback(false));

socket.on(EVENTS.RECAP_UPDATE, (recap) => {
  if (recap.id === currentRecapId) renderRecap(recap);
});
// Vergroten: volledig scherm, en op toestellen die het toelaten (Android) meteen liggend.
// Lukt dat niet (bv. iPhone), dan vult de slide gewoon het scherm en kan de student de gsm zelf draaien.
async function openSlide() {
  $('#slide-full').showModal();
  try {
    await document.documentElement.requestFullscreen();
    await screen.orientation.lock('landscape');
  } catch {
    // Niet ondersteund: de vergrote weergave werkt ook zonder.
  }
}

function closeSlide() {
  $('#slide-full').close();
  screen.orientation?.unlock?.();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

$('#slide-open').addEventListener('click', openSlide);
$('#slide-full form button').addEventListener('click', (event) => {
  event.preventDefault();
  closeSlide();
});
$('#slide-full').addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSlide();
});
socket.on(EVENTS.SLIDE_IMAGE, showSlide);
socket.on(EVENTS.SESSION_ENDED, () => showOnly(Object.values(screens), screens.ended));
onReconnect(() => {
  if (joinedCode) join(joinedCode).catch(() => showOnly(Object.values(screens), screens.ended));
});

setStatus(HINT);
const codeFromLink = new URLSearchParams(location.search).get('code');
if (codeFromLink) {
  $('#code-input').value = codeFromLink;
  $('#join-form').requestSubmit();
}
