import http from 'http';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { botEngine } from './bot.js';

let express = null;
try { express = (await import('express')).default; } catch (err) {}

export function createServer() {
  const ROOT_DIR = process.cwd();
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

    app.use(express.static(path.join(ROOT_DIR, 'frontend')));

    app.get('/api/status', (req, res) => res.json(botEngine.getStatus()));
    app.get('/api/logs', (req, res) => res.json(logger.getHistory()));
    app.post('/api/logs/clear', (req, res) => {
      logger.clearHistory();
      res.json({ success: true, message: 'Logs cleared.' });
    });

    app.get('/api/logs/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      res.write(`data: ${JSON.stringify({ type: 'history', logs: logger.getHistory() })}\n\n`);

      const logHandler = (logEntry) => {
        res.write(`data: ${JSON.stringify({ type: 'log', log: logEntry })}\n\n`);
      };

      const clearHandler = () => {
        res.write(`data: ${JSON.stringify({ type: 'cleared' })}\n\n`);
      };

      logger.on('log', logHandler);
      logger.on('cleared', clearHandler);
      req.on('close', () => {
        logger.off('log', logHandler);
        logger.off('cleared', clearHandler);
      });
    });

    app.post('/api/control/start', async (req, res) => { botEngine.start(); res.json({ success: true }); });
    app.post('/api/control/stop', async (req, res) => { await botEngine.stop(); res.json({ success: true }); });
    app.post('/api/control/reset_session', async (req, res) => {
      logger.warn('Dashboard: Initiated Session Reset & QR Re-generation');
      await botEngine.resetSession();
      setTimeout(() => botEngine.start(true), 1000);
      res.json({ success: true, message: 'Session reset. Generating new QR code...' });
    });

    app.get('*', (req, res) => res.sendFile(path.join(ROOT_DIR, 'frontend', 'index.html')));
    return app;
  }

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
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mark Zuckerberg Assistant Server');
  });
}

export function startServer() {
  const server = createServer();
  return server.listen(config.port, config.host, () => {
    logger.info(`[SYSTEM] Dashboard running on port ${config.port}`);
  });
}
