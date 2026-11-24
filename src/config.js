try {
  process.loadEnvFile();
} catch {
  // Geen .env-bestand: we gebruiken de omgevingsvariabelen van het systeem (zoals op Render).
}

export const config = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  publicUrl: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  sessionTtlMs: 6 * 60 * 60 * 1000,
});
