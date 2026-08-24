import { config } from '../config.js';
import { logger } from './logger.js';
import { db } from './db.js';

class AntiBanManager {
  constructor() {
    this.replyTimestamps = new Map();
  }

  checkRateLimit(jid) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxAllowed = config.rateLimitMaxPerMinute;

    if (!this.replyTimestamps.has(jid)) {
      return true;
    }

    const timestamps = this.replyTimestamps.get(jid) || [];
    const recentTimestamps = timestamps.filter(ts => (now - ts) < windowMs);

    if (recentTimestamps.length === 0) {
      this.replyTimestamps.delete(jid);
    } else {
      this.replyTimestamps.set(jid, recentTimestamps);
    }

    if (recentTimestamps.length >= maxAllowed) {
      logger.warn(`Anti-Ban Rate Limit triggered for ${jid}. (${recentTimestamps.length}/${maxAllowed} msgs in last min)`);
      db.incrementMetric('rateLimitedCount');
      return false;
    }

    return true;
  }

  recordReply(jid) {
    const now = Date.now();
    const windowMs = 60 * 1000;

    let timestamps = this.replyTimestamps.get(jid) || [];
    timestamps = timestamps.filter(ts => (now - ts) < windowMs);
    timestamps.push(now);
    this.replyTimestamps.set(jid, timestamps);
    db.incrementMetric('totalRepliesSent');
  }

  /**
   * Smooth presence sequence:
   * 1. Brief silent pause (2 seconds)
   * 2. Active typing animation (3-5 seconds)
   */
  async applyHumanDelay(sock, jid) {
    const totalMinMs = config.antiBanMinDelayMs || 1500;
    const totalMaxMs = config.antiBanMaxDelayMs || 3000;
    const totalDelay = Math.floor(Math.random() * (totalMaxMs - totalMinMs + 1)) + totalMinMs;

    // Phase 1: Silent thinking phase (800ms)
    const silentMs = 800;
    const typingMs = Math.max(totalDelay - silentMs, 1000);

    logger.info(`[ANTI-BAN] Chat: ${jid} | Sequence: ${silentMs}ms pause -> ${typingMs}ms typing simulation`);

    await new Promise(resolve => setTimeout(resolve, silentMs));

    // Phase 2: Typing animation phase
    try {
      if (sock && typeof sock.sendPresenceUpdate === 'function') {
        await sock.sendPresenceUpdate('composing', jid);
      }
    } catch (err) {}

    await new Promise(resolve => setTimeout(resolve, typingMs));

    // Phase 3: Pause presence so typing indicator never stays stuck
    try {
      if (sock && typeof sock.sendPresenceUpdate === 'function') {
        await sock.sendPresenceUpdate('paused', jid);
      }
    } catch (err) {}
  }
}

export const antiBan = new AntiBanManager();
