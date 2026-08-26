import { startServer } from './server.js';
import { botEngine } from './bot.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

// 1. Start Web Dashboard and Bot Engine
const server = startServer();
botEngine.start();

// 2. Memory Footprint Reporter (Alwaysdata Free Tier 256MB)
const mem = process.memoryUsage();
const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
logger.info(`[SYSTEM] Bot Booted. RAM usage: ${rssMb}MB RSS (${heapMb}MB Heap)`);

// 3. Graceful Shutdown Handlers (Prevents Baileys session corruption on host restart/deploy)
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

