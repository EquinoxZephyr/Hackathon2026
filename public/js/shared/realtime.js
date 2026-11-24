import { io } from '/socket.io/socket.io.esm.min.js';

const REQUEST_TIMEOUT_MS = 20_000;

export const socket = io();

// Stuurt een event en wacht op het antwoord van de server. Een antwoord met `error` wordt een fout.
export function request(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(REQUEST_TIMEOUT_MS).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) reject(new Error('timeout'));
      else if (response?.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

// Voert `callback` uit bij elke herverbinding, zodat een pagina haar sessie terug kan opnemen.
export function onReconnect(callback) {
  socket.io.on('reconnect', callback);
}
