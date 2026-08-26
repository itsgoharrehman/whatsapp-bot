import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { botEngine } from './bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

let express = null;
try {
  const mod = await import('express');
  express = mod.default || mod;
} catch (err) {
  logger.warn(`Express not loaded, running fallback HTTP server: ${err.message}`);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStaticFile(req, res, pathname) {
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '' || safePath === '\\') {
    safePath = '/index.html';
  }

  let filePath = path.join(FRONTEND_DIR, safePath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(FRONTEND_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

export function createServer() {
  if (express) {
    const app = express();
    app.use(express.json());

    // API Key Authentication Middleware
    app.use('/api', (req, res, next) => {
      const secret = config.dashboardSecret || process.env.DASHBOARD_SECRET;
      if (secret) {
        const apiKey = req.headers['x-api-key'] || req.query.key;
        if (apiKey !== secret) {
          return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
        }
      }
      next();
    });

    app.use(express.static(FRONTEND_DIR));

    app.get('/api/status', (req, res) => res.json(botEngine.getStatus()));
    app.get('/api/logs', (req, res) => res.json(logger.getHistory()));
    app.post('/api/logs/clear', (req, res) => {
      logger.clearHistory();
      res.json({ success: true, message: 'Logs cleared.' });
    });

    app.post('/api/control/start', async (req, res) => { botEngine.start(); res.json({ success: true }); });
    app.post('/api/control/stop', async (req, res) => { await botEngine.stop(); res.json({ success: true }); });
    app.post('/api/control/reset_session', async (req, res) => {
      logger.warn('Dashboard: Initiated Session Reset & QR Re-generation');
      await botEngine.resetSession();
      setTimeout(() => botEngine.start(true), 1000);
      res.json({ success: true, message: 'Session reset. Generating new QR code...' });
    });

    app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
    return app;
  }

  // Native HTTP Fallback Server
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const secret = config.dashboardSecret || process.env.DASHBOARD_SECRET;

    if (url.pathname.startsWith('/api') && secret) {
      const apiKey = req.headers['x-api-key'] || url.searchParams.get('key');
      if (apiKey !== secret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing API key' }));
      }
    }

    if (url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(botEngine.getStatus()));
    }
    if (url.pathname === '/api/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(logger.getHistory()));
    }
    if (url.pathname === '/api/logs/clear' && req.method === 'POST') {
      logger.clearHistory();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: 'Logs cleared.' }));
    }
    if (url.pathname === '/api/control/reset_session' && req.method === 'POST') {
      botEngine.resetSession().then(() => setTimeout(() => botEngine.start(true), 1000));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: 'Session reset.' }));
    }

    // Serve Frontend Static UI
    serveStaticFile(req, res, url.pathname);
  });
}

export function startServer() {
  const server = createServer();
  return server.listen(config.port, config.host, () => {
    logger.info(`[SYSTEM] Dashboard running on port ${config.port}`);
  });
}
