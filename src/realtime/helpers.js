import { EVENTS } from '../../shared/protocol.js';
import { getSession } from '../session/sessionStore.js';

export const rooms = Object.freeze({
  lecturer: (code) => `lecturer:${code}`,
  students: (code) => `students:${code}`,
  recap: (code, recapId) => `recap:${code}:${recapId}`,
});

export function reply(ack, data) {
  if (typeof ack === 'function') ack(data);
}

export function emitStats(io, session) {
  io.to(rooms.lecturer(session.code)).emit(EVENTS.STATS, session.stats());
}

// Registreert een event dat alleen werkt voor een socket met de juiste rol in een bestaande sessie.
export function onRole(socket, role, event, handler) {
  socket.on(event, async (payload, ack) => {
    const session = socket.data.role === role ? getSession(socket.data.code) : undefined;
    if (!session) return reply(ack, { error: 'no-session' });
    try {
      await handler(session, payload ?? {}, ack);
    } catch (error) {
      console.error(`Fout bij ${event}:`, error);
      reply(ack, { error: 'server' });
    }
  });
}
