import { randomBytes } from 'node:crypto';
import { LIMITS } from '../../shared/protocol.js';
import { lastWords } from '../util/text.js';

export class Session {
  constructor(code, slides, settings) {
    this.code = code;
    this.lecturerKey = randomBytes(16).toString('hex');
    this.slides = slides;
    this.settings = settings;
    this.startedAt = Date.now();
    this.context = { transcript: '', slideIndex: 0 };
    this.students = new Set();
    this.simulatedStudents = [];
    this.taps = [];
    this.alerts = [];
    this.recaps = new Map();
    this.feedback = { clear: 0, unclear: 0 };
    this.aiCalls = 0;
    this.lastAlertAt = 0;
  }

  get currentSlide() {
    return this.slides[this.context.slideIndex];
  }

  updateContext({ transcript, slideIndex }) {
    if (typeof transcript === 'string') {
      this.context.transcript = transcript.slice(-LIMITS.MAX_TRANSCRIPT_CHARS).trim();
    }
    if (Number.isInteger(slideIndex) && slideIndex >= 0 && slideIndex < this.slides.length) {
      this.context.slideIndex = slideIndex;
    }
  }

  // Eén "moment" = dezelfde slide binnen hetzelfde venster van een minuut. Per moment maken we één uitleg.
  momentKey(now) {
    const window = Math.floor((now - this.startedAt) / LIMITS.MOMENT_WINDOW_MS);
    return `${this.context.slideIndex}:${window}`;
  }

  addSimulatedStudents(count) {
    for (let i = 0; i < count; i += 1) {
      const id = `sim-${this.simulatedStudents.length + 1}`;
      this.simulatedStudents.push(id);
      this.students.add(id);
    }
  }

  checkTap(studentId, now) {
    const own = this.taps.filter((tap) => tap.studentId === studentId);
    if (own.length >= LIMITS.MAX_TAPS_PER_STUDENT) return 'limit';
    if (own.length > 0 && now - own.at(-1).at < LIMITS.TAP_COOLDOWN_MS) return 'cooldown';
    return null;
  }

  recordTap(studentId, now) {
    this.taps.push({ studentId, at: now, slideIndex: this.context.slideIndex });
  }

  recordFeedback(clear) {
    this.feedback[clear ? 'clear' : 'unclear'] += 1;
  }

  stats(now = Date.now()) {
    const recent = this.taps.filter((tap) => tap.at >= now - LIMITS.PEAK_WINDOW_MS);
    return {
      students: this.students.size,
      recentTaps: new Set(recent.map((tap) => tap.studentId)).size,
      totalTaps: this.taps.length,
      aiCalls: this.aiCalls,
    };
  }

  #share({ students, recentTaps }) {
    return recentTaps / Math.max(students, 1);
  }

  // Geeft de melding die naar de lector moet, of null. Bij een nieuwe piek is dat een nieuwe melding.
  // Binnen de wachttijd na een melding komt er geen nieuwe, maar stijgt het percentage van de lopende mee.
  peakAlert(now) {
    const stats = this.stats(now);
    const share = this.#share(stats);
    if (stats.recentTaps < LIMITS.PEAK_MIN_TAPS || share < LIMITS.PEAK_SHARE) return null;

    const sharePercent = Math.round(share * 100);
    const current = this.alerts.at(-1);
    if (current && now - this.lastAlertAt < LIMITS.ALERT_COOLDOWN_MS) {
      if (sharePercent <= current.sharePercent) return null;
      current.sharePercent = sharePercent;
      return current;
    }

    const alert = {
      id: this.alerts.length + 1,
      atMs: now - this.startedAt,
      slideTitle: this.currentSlide.title,
      sharePercent,
      snippet: lastWords(this.context.transcript, LIMITS.SNIPPET_WORDS),
    };
    this.alerts.push(alert);
    this.lastAlertAt = now;
    return alert;
  }

  summary() {
    return {
      durationMs: Date.now() - this.startedAt,
      perSlide: this.slides.map((slide, index) => ({
        title: slide.title,
        taps: this.taps.filter((tap) => tap.slideIndex === index).length,
      })),
      alerts: this.alerts,
      feedback: this.feedback,
      ...this.stats(),
    };
  }
}
