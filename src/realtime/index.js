import { registerLecturerHandlers } from './lecturerHandlers.js';
import { registerStudentHandlers } from './studentHandlers.js';

export function registerRealtime(io) {
  io.on('connection', (socket) => {
    registerLecturerHandlers(io, socket);
    registerStudentHandlers(io, socket);
  });
}
