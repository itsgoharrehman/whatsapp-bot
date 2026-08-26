import { startServer } from './server.js';
import { botEngine } from './bot.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

// 1. Start Web Dashboard and Bot Engine
const server = startServer();
botEngine.start();

// 2. Memory Footprint Reporter (For Alwaysdata 256MB Free Tier)
const mem = process.memoryUsage();
const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
logger.info(`[SYSTEM] Bot Booted. RAM usage: ${rssMb}MB RSS (${heapMb}MB Heap)`);

// 3. Alwaysdata Keep-Alive Anti-Idle Pinger
// Pings local dashboard every 8 minutes to prevent Alwaysdata reverse proxy from shutting down upstream for "idle"
const KEEP_ALIVE_INTERVAL_MS = 8 * 60 * 1000;
setInterval(async () => {
  try {
    const host = config.host && config.host !== '0.0.0.0' && !config.host.startsWith('fd00') ? config.host : '127.0.0.1';
    const res = await fetch(`http://${host}:${config.port}/api/status`, {
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const currentMem = process.memoryUsage();
      const currentRss = (currentMem.rss / 1024 / 1024).toFixed(1);
      // Run manual garbage collection if exposed and memory > 180MB
      if (global.gc && currentMem.rss > 180 * 1024 * 1024) {
        global.gc();
      }
    }
  } catch (err) {
    // Keep-alive ping quiet catch
  }
}, KEEP_ALIVE_INTERVAL_MS);

// 4. Graceful Shutdown Handlers (Prevents Baileys session corruption on host restart/deploy)
const gracefulShutdown = async (signal) => {
  logger.warn(`[SYSTEM] Received ${signal}. Executing graceful shutdown...`);
  try {
    await botEngine.stop();
  } catch (err) {}
  try {
    if (server && server.close) {
      server.close();
    }
  } catch (err) {}
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error(`[UNCAUGHT] ${err.message}`, err.stack);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`[UNHANDLED REJECTION] ${reason}`);
});

