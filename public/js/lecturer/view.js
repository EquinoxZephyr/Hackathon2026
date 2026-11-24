import { $, el, formatClock, renderFigures } from '../shared/dom.js';

export const alertHeadline = (alert) => `${alert.sharePercent}% volgt het niet meer, om ${formatClock(alert.atMs)}`;
export const alertDetail = (alert) => `Bij de slide "${alert.slideTitle}"`;

function alertItem(alert) {
  return el(
    'li',
    { class: 'alert' },
    el('strong', {}, alertHeadline(alert)),
    el('span', {}, alertDetail(alert)),
    el('span', {}, alert.snippet ? el('span', { class: 'marker' }, alert.snippet) : 'Er was nog geen transcript.'),
  );
}

function renderAlertList(list, alerts, emptyText) {
  list.replaceChildren(...(alerts.length ? alerts.map(alertItem) : [el('li', { class: 'muted' }, emptyText)]));
}

export function renderSession({ code, joinUrl, qr, aiEnabled }) {
  $('#qr').src = qr;
  $('#code').textContent = code;
  $('#join-url').href = joinUrl;
  $('#join-url').textContent = joinUrl;
  $('#ai-status').textContent = aiEnabled ? 'Uitleg door het taalmodel (Gemini)' : 'Uitleg zonder AI: er is geen API-sleutel ingesteld';
}

export const setSourceStatus = (text) => { $('#source-status').textContent = text; };
export const setMatcherStatus = (text) => { $('#matcher-status').textContent = text; };

// Eén regel per stukje spraak, met het tijdstip in de les. De nieuwste regel staat bovenaan.
export function renderTranscript(entries, startedAt) {
  const transcript = $('#transcript');
  transcript.replaceChildren(
    ...entries.toReversed().map((entry) =>
      el('li', {}, el('time', {}, formatClock(entry.at - startedAt)), el('span', {}, entry.text)),
    ),
  );
  transcript.scrollTop = 0;
}

// Woorden die de spraakherkenning nog aan het verwerken is, boven het transcript.
export function renderInterim(text) {
  $('#interim').textContent = text;
  $('#interim').hidden = !text;
}

export function renderMicLevel(level) {
  $('#mic-meter').hidden = false;
  $('#mic-level').style.width = `${Math.round(level * 100)}%`;
}

export function renderSlide(slide, index, total) {
  $('#slide-title').textContent = slide.title;
  $('#slide-pos').textContent = `Slide ${index + 1} van ${total}, herkend uit wat je zegt`;
}

export function renderStats({ students, recentTaps, totalTaps, aiCalls }) {
  renderFigures($('#stats'), [
    { label: students === 1 ? 'student' : 'studenten', value: students },
    { label: 'kwijt nu', value: recentTaps },
    { label: 'tikken', value: totalTaps },
    { label: 'AI-oproepen', value: aiCalls },
  ]);
}

// Alleen de nieuwste melding staat open; eerdere zitten in een inklapbare lijst,
// zodat het transcript eronder niet telkens verder naar beneden schuift.
// Een melding met een bekend id is een update van de lopende melding (hoger percentage).
const liveAlerts = [];
export function showAlert(alert) {
  if (liveAlerts[0]?.id === alert.id) liveAlerts[0] = alert;
  else liveAlerts.unshift(alert);
  const [latest, ...older] = liveAlerts;
  $('#alerts').replaceChildren(alertItem(latest));
  $('#older-alerts').hidden = older.length === 0;
  $('#older-alerts-summary').textContent = `Eerdere meldingen (${older.length})`;
  $('#older-alerts-list').replaceChildren(...older.map(alertItem));
}

export function renderOverview(summary) {
  renderFigures($('#summary-stats'), [
    { label: 'minuten', value: formatClock(summary.durationMs) },
    { label: 'tikken', value: summary.totalTaps },
    { label: 'meldingen', value: summary.alerts.length },
    { label: 'AI-oproepen', value: summary.aiCalls },
    { label: 'snapten het daarna', value: summary.feedback.clear },
    { label: 'nog niet helemaal', value: summary.feedback.unclear },
  ]);

  const maxTaps = Math.max(1, ...summary.perSlide.map((slide) => slide.taps));
  $('#per-slide').replaceChildren(
    ...summary.perSlide.map((slide, index) =>
      el(
        'div',
        { class: 'bar-row' },
        el('span', { class: 'label', title: slide.title }, `${index + 1}. ${slide.title}`),
        el('div', { class: 'bar', style: `width: ${(slide.taps / maxTaps) * 100}%` }),
        el('span', { class: 'count' }, String(slide.taps)),
      ),
    ),
  );
  renderAlertList($('#summary-alerts'), summary.alerts, 'Er waren geen momenten waarop veel studenten tegelijk afhaakten.');
}
