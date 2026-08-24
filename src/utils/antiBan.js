import { config } from '../config.js';
import { logger } from './logger.js';

class AntiBanManager {
  constructor() {
    this.lastRequestTimes = new Map();
  }

  checkRateLimit(jid) {
    const now = Date.now();
    const cooldownMs = config.antiSpamCooldownMs || 30000;

    if (!this.lastRequestTimes.has(jid)) {
      return true;
    }

    const lastTime = this.lastRequestTimes.get(jid) || 0;
    if (now - lastTime < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - (now - lastTime)) / 1000);
      logger.warn(`Rate limit active for ${jid}. Must wait ${waitSeconds}s.`);
      return false;
    }

    return true;
  }

  recordReply(jid) {
    this.lastRequestTimes.set(jid, Date.now());
  }

  /**
   * Applies realistic typing indicator while parallel synthesis runs.
   */
  async applyHumanDelay(sock, jid) {
    try {
      if (sock && typeof sock.sendPresenceUpdate === 'function') {
        await sock.sendPresenceUpdate('composing', jid);
      }
    } catch (err) {}
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

export const antiBan = new AntiBanManager();
