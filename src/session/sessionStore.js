import { config } from '../config.js';
import { Session } from './Session.js';

const sessions = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function newCode() {
  let code;
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (sessions.has(code));
  return code;
}

export function createSession(slides, settings) {
  const session = new Session(newCode(), slides, settings);
  sessions.set(session.code, session);
  return session;
}

export function getSession(code) {
  return typeof code === 'string' ? sessions.get(code.toUpperCase()) : undefined;
}

export function deleteSession(code) {
  sessions.delete(code);
}

setInterval(() => {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (now - session.startedAt > config.sessionTtlMs) sessions.delete(code);
  }
}, CLEANUP_INTERVAL_MS).unref();
