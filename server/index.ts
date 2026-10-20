import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config';
import { attachLive } from './live';
import { mountRoutes } from './routes';
import { securityHeaders } from './security';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  mountRoutes(app);

  const server = http.createServer(app);
  attachLive(server);

  if (config.isProduction) {
    const dist = path.join(root, 'dist');
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  server.listen(config.port, '0.0.0.0', () => {
    const mode = config.mock ? 'SİMÜLASYON (API anahtarı yok veya MOCK_AI=1)' : `Gemini (${config.models.live})`;
    console.log(`[tercüman] http://localhost:${config.port} · ${mode}`);
  });
}

main().catch((err) => {
  console.error('Sunucu başlatılamadı:', err);
  process.exit(1);
});
