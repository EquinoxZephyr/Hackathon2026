import QRCode from 'qrcode';
import { EVENTS, LIMITS } from '../../shared/protocol.js';
import { aiEnabled } from '../recap/gemini.js';
import { createSession, deleteSession, getSession } from '../session/sessionStore.js';
import { publicBaseUrl } from '../util/baseUrl.js';
import { sanitizeSettings, sanitizeSlides } from '../util/validate.js';
import { onRole, reply, rooms } from './helpers.js';
import { simulateConfusion } from './tapFlow.js';

function attachLecturer(socket, session) {
  socket.data = { role: 'lecturer', code: session.code };
  socket.join(rooms.lecturer(session.code));
}

export function registerLecturerHandlers(io, socket) {
  socket.on(EVENTS.SESSION_CREATE, async (payload, ack) => {
    const slides = sanitizeSlides(payload?.slides);
    if (!slides) return reply(ack, { error: 'invalid-slides' });

    const session = createSession(slides, sanitizeSettings(payload.settings));
    if (payload.demo) session.addSimulatedStudents(LIMITS.DEMO_AUDIENCE);
    attachLecturer(socket, session);

    const joinUrl = `${publicBaseUrl(socket.handshake)}/s/${session.code}`;
    reply(ack, {
      code: session.code,
      lecturerKey: session.lecturerKey,
      joinUrl,
      qr: await QRCode.toDataURL(joinUrl, { margin: 1, width: 320 }),
      aiEnabled,
      stats: session.stats(),
    });
  });

  // Na een herverbinding (bv. wifi die even wegvalt) neemt de lector de sessie terug op.
  socket.on(EVENTS.SESSION_RESUME, (payload, ack) => {
    const session = getSession(payload?.code);
    if (!session || session.lecturerKey !== payload?.lecturerKey) return reply(ack, { error: 'no-session' });
    attachLecturer(socket, session);
    reply(ack, { stats: session.stats() });
  });

  onRole(socket, 'lecturer', EVENTS.CONTEXT_UPDATE, (session, payload) => session.updateContext(payload));

  onRole(socket, 'lecturer', EVENTS.SETTINGS_UPDATE, (session, payload) => {
    session.settings = sanitizeSettings(payload);
  });

  onRole(socket, 'lecturer', EVENTS.SIMULATE, (session) => simulateConfusion(io, session));

  onRole(socket, 'lecturer', EVENTS.SESSION_END, (session, _payload, ack) => {
    const summary = session.summary();
    io.to(rooms.students(session.code)).emit(EVENTS.SESSION_ENDED);
    deleteSession(session.code);
    reply(ack, summary);
  });
}
