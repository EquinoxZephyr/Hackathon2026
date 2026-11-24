import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { LIMITS } from '../shared/protocol.js';
import { config } from './config.js';
import { aiEnabled } from './recap/gemini.js';
import { registerRealtime } from './realtime/index.js';

const rootDir = (folder) => fileURLToPath(new URL(`../${folder}`, import.meta.url));

const app = express();
app.use(express.static(rootDir('public')));
app.use('/shared', express.static(rootDir('shared')));
app.get('/s/:code', (req, res) => res.redirect(`/student.html?code=${encodeURIComponent(req.params.code)}`));
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
// Ruimte voor het geluidsfragment van een meertalige les (±1 MB) bovenop de standaardlimiet.
registerRealtime(new Server(httpServer, { maxHttpBufferSize: LIMITS.MAX_AUDIO_BYTES * 1.5 }));

httpServer.listen(config.port, () => {
  console.log(`Frank draait op http://localhost:${config.port}`);
  console.log(aiEnabled ? `Taalmodel: ${config.geminiModel}` : 'Geen GEMINI_API_KEY: uitleg komt uit de slidetekst (zonder AI).');
});
