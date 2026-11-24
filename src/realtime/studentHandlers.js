import { EVENTS } from '../../shared/protocol.js';
import { getSession } from '../session/sessionStore.js';
import { sanitizeId } from '../util/validate.js';
import { emitStats, onRole, reply, rooms } from './helpers.js';
import { handleTap } from './tapFlow.js';

export function registerStudentHandlers(io, socket) {
  socket.on(EVENTS.SESSION_JOIN, (payload, ack) => {
    const session = getSession(payload?.code);
    const studentId = sanitizeId(payload?.studentId);
    if (!session || !studentId) return reply(ack, { error: 'no-session' });

    socket.data = { role: 'student', code: session.code, studentId };
    socket.join(rooms.students(session.code));
    session.students.add(studentId);
    emitStats(io, session);
    reply(ack, { code: session.code });
  });

  onRole(socket, 'student', EVENTS.TAP, (session, _payload, ack) => {
    reply(ack, handleTap(io, session, socket.data.studentId, socket));
  });

  onRole(socket, 'student', EVENTS.FEEDBACK, (session, payload) => {
    session.recordFeedback(payload.clear === true);
  });

  socket.on('disconnect', () => {
    const session = socket.data.role === 'student' ? getSession(socket.data.code) : undefined;
    if (!session) return;
    session.students.delete(socket.data.studentId);
    emitStats(io, session);
  });
}
