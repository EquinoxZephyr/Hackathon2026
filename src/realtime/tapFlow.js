import { EVENTS, LIMITS } from '../../shared/protocol.js';
import { getRecap } from '../recap/recapService.js';
import { sanitizeAudio } from '../util/validate.js';
import { emitStats, rooms } from './helpers.js';

// Vraagt de lector om het geluid van de laatste seconden. Lukt dat niet op tijd,
// dan maakt Frank de uitleg gewoon met het transcript.
async function fetchLecturerAudio(io, session) {
  try {
    const answers = await io
      .to(rooms.lecturer(session.code))
      .timeout(LIMITS.AUDIO_REQUEST_TIMEOUT_MS)
      .emitWithAck(EVENTS.AUDIO_REQUEST);
    return answers.map(sanitizeAudio).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

// Antwoordt meteen met wat er al is (slide en fragment). De uitleg zelf volgt via RECAP_UPDATE.
// `socket` ontbreekt bij gesimuleerde studenten: die lezen niet mee.
export function handleTap(io, session, studentId, socket) {
  const now = Date.now();
  const refusal = session.checkTap(studentId, now);
  if (refusal) return { error: refusal };

  session.recordTap(studentId, now);
  const alert = session.peakAlert(now);
  if (alert) io.to(rooms.lecturer(session.code)).emit(EVENTS.ALERT, alert);

  const recap = getRecap(session, now, {
    publish: (update) => io.to(rooms.recap(session.code, update.id)).emit(EVENTS.RECAP_UPDATE, update),
    fetchAudio: () => fetchLecturerAudio(io, session),
  });
  if (socket) {
    if (socket.data.recapRoom) socket.leave(socket.data.recapRoom);
    socket.data.recapRoom = rooms.recap(session.code, recap.id);
    socket.join(socket.data.recapRoom);
  }

  emitStats(io, session);
  return { recap: { ...recap } };
}

// Laat een deel van de gesimuleerde studenten verspreid over enkele seconden tikken.
export function simulateConfusion(io, session) {
  if (session.simulatedStudents.length === 0) session.addSimulatedStudents(LIMITS.DEMO_AUDIENCE);

  const now = Date.now();
  const candidates = session.simulatedStudents
    .filter((id) => !session.checkTap(id, now))
    .sort(() => Math.random() - 0.5)
    .slice(0, LIMITS.SIM_CONFUSED);

  for (const id of candidates) {
    setTimeout(() => handleTap(io, session, id), Math.random() * LIMITS.SIM_SPREAD_MS);
  }
  emitStats(io, session);
}
