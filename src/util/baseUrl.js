import os from 'node:os';
import { config } from '../config.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function lanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    const match = addresses?.find((a) => a.family === 'IPv4' && !a.internal);
    if (match) return match.address;
  }
  return null;
}

// Achter een proxy (zoals bij Render) kan een header meerdere waarden bevatten: de eerste is die van de bezoeker.
const firstHeader = (value) => value?.split(',')[0].trim() || undefined;

// De link in de QR-code moet bereikbaar zijn vanaf een gsm, dus nooit "localhost".
// Volgorde: vaste URL uit de instellingen, dan de headers van de proxy, dan het LAN-adres van deze computer.
export function publicBaseUrl(handshake) {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, '');

  const { headers } = handshake;
  const host = firstHeader(headers['x-forwarded-host']) ?? headers.host ?? `localhost:${config.port}`;
  const protocol = firstHeader(headers['x-forwarded-proto']) ?? (handshake.secure ? 'https' : 'http');
  const url = new URL(`${protocol}://${host}`);

  if (LOCAL_HOSTS.has(url.hostname)) {
    const lan = lanAddress();
    if (lan) url.hostname = lan;
  }
  return url.origin;
}
