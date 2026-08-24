import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { db } from './utils/db.js';
import { antiBan } from './utils/antiBan.js';
import { aiProvider } from './ai/provider.js';
import permissionChecker from './utils/permissionChecker.js';
import adminCommands from './commands/admin.js';
import { skillResolver, skillLoader } from './skills/index.js';

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, QRCode, pino;

try {
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.default?.default || baileys.default || baileys.makeWASocket || baileys;
  useMultiFileAuthState = baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason || baileys.default?.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion || baileys.default?.fetchLatestBaileysVersion;
  downloadMediaMessage = baileys.downloadMediaMessage || baileys.default?.downloadMediaMessage;

  const qrMod = await import('qrcode');
  QRCode = qrMod.default?.default || qrMod.default || qrMod;

  const pinoMod = await import('pino');
  pino = pinoMod.default?.default || pinoMod.default || pinoMod;
} catch (err) {
  logger.error(`[CRITICAL] Error importing Baileys or dependencies: ${err.message}`);
}

class BoundedTtlSet {
  constructor(maxSize = 2000, ttlMs = 15 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.items = new Map();
  }

  has(key) {
    if (!key) return false;
    const ts = this.items.get(key);
    if (!ts) return false;
    if (Date.now() - ts > this.ttlMs) {
      this.items.delete(key);
      return false;
    }
    return true;
  }

  add(key) {
    if (!key) return;
    const now = Date.now();
    this.items.set(key, now);
    if (this.items.size > this.maxSize) {
      const cutoff = now - this.ttlMs;
      for (const [k, v] of this.items.entries()) {
        if (v < cutoff || this.items.size > this.maxSize) {
          this.items.delete(k);
        }
      }
    }
  }

  clear() {
    this.items.clear();
  }
}

class WhatsAppArtifactEngine extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.qrCodeDataUrl = null;
    this.status = 'DISCONNECTED';
    this.botJid = null;
    this.botLid = null;
    this.isStopping = false;
    this.startTime = Math.floor(Date.now() / 1000);
    this.sentBotMsgIds = new BoundedTtlSet(3000, 60 * 60 * 1000);
    this.processedInboundMsgIds = new BoundedTtlSet(3000, 30 * 60 * 1000);
    this.reconnectTimer = null;
  }

  async start(forceNewSession = false) {
    if (this.status === 'CONNECTING' || (this.status === 'CONNECTED' && !forceNewSession)) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!makeWASocket) {
      this.status = 'DISCONNECTED';
      this.emit('status', this.status);
      return;
    }

    if (forceNewSession) {
      await this.resetSession();
    }

    if (this.sock) {
      try { await this.sock.end(); } catch (err) {}
      this.sock = null;
    }

    this.isStopping = false;
    this.status = 'CONNECTING';
    this.emit('status', this.status);

    try {
      const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Artifact Engine', 'Chrome', '1.0.0']
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;

        if (qr && this.status !== 'CONNECTED') {
          this.status = 'QR_READY';
          if (QRCode) this.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          this.emit('qr', this.qrCodeDataUrl);
          this.emit('status', this.status);
        }

        if (connection === 'open') {
          this.status = 'CONNECTED';
          this.startTime = Math.floor(Date.now() / 1000);
          this.qrCodeDataUrl = null;
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          this.botJid = this.sock.user?.id || null;
          this.botLid = this.sock.user?.lid || this.sock.authState?.creds?.me?.lid || null;
          logger.info(`[SYSTEM] Artifact Bot Connected! JID: ${this.botJid} (LID: ${this.botLid})`);
          this.emit('status', this.status);
        }

        if (connection === 'close') {
          this.qrCodeDataUrl = null;
          this.status = 'DISCONNECTED';
          this.emit('status', this.status);
          if (!this.isStopping) {
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.start(), 5000);
          }
        }
      });

      this.sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify' || !Array.isArray(m.messages)) return;
        m.messages.forEach(msg => {
          this.handleIncomingMessage(msg).catch(err => {
            logger.error('Unhandled message error:', err.message);
          });
        });
      });

    } catch (err) {
      this.status = 'DISCONNECTED';
      this.emit('status', this.status);
    }
  }

  async stop() {
    this.isStopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try { await this.sock.end(); } catch (err) {}
      this.sock = null;
    }
    this.status = 'DISCONNECTED';
    this.qrCodeDataUrl = null;
    this.emit('status', this.status);
  }

  async resetSession() {
    logger.info('Resetting session & purging credentials directory...');
    await this.stop();
    try {
      if (fs.existsSync(config.sessionDir)) {
        fs.rmSync(config.sessionDir, { recursive: true, force: true });
      }
    } catch (err) {
      logger.error('Error clearing session dir:', err.message);
    }
    this.qrCodeDataUrl = null;
    this.status = 'DISCONNECTED';
    this.emit('status', this.status);
  }

  async dispatchMessage(chatJid, content, isGroup = false, originalMsg = null) {
    if (!this.sock) return false;
    try {
      const options = isGroup && originalMsg ? { quoted: originalMsg } : {};
      const res = await this.sock.sendMessage(chatJid, content, options);
      if (res?.key?.id) {
        this.sentBotMsgIds.add(res.key.id);
        this.sentBotMsgIds.add(`${chatJid}:${res.key.id}`);
        this.processedInboundMsgIds.add(res.key.id);
        this.processedInboundMsgIds.add(`${chatJid}:${res.key.id}`);
      }
      return true;
    } catch (err) {
      logger.error(`Send message to ${chatJid} failed:`, err.message);
      return false;
    }
  }

  async handleIncomingMessage(m) {
    try {
      if (!m || !m.message || !m.key) return;
      const chatJid = m.key.remoteJid;
      const isFromMe = Boolean(m.key.fromMe);
      const msgId = m.key.id;
      const senderJid = m.key.participant || m.key.remoteJid;

      if (!msgId || !chatJid) return;
      if (permissionChecker.isBroadcastOrNewsletter(chatJid)) return;

      // Drop stale messages (> 180s or before bot boot)
      const rawTs = m.messageTimestamp;
      const msgTimestamp = typeof rawTs === 'object' && rawTs !== null ? (rawTs.low || Number(rawTs)) : Number(rawTs);
      if (msgTimestamp && !isNaN(msgTimestamp) && msgTimestamp > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (this.startTime && msgTimestamp < (this.startTime - 10)) return;
        if (nowSec - msgTimestamp > 180) return;
      }

      // Deduplication
      const dedupeKey = `${chatJid}:${msgId}`;
      if (this.processedInboundMsgIds.has(dedupeKey) || this.processedInboundMsgIds.has(msgId)) return;
      this.processedInboundMsgIds.add(dedupeKey);
      this.processedInboundMsgIds.add(msgId);

      if (this.sentBotMsgIds.has(msgId)) return;

      const unwrapped = permissionChecker.unwrapMessage(m);
      if (!unwrapped) return;

      const rawText = permissionChecker.extractMessageText(unwrapped);
      if (!rawText || !rawText.trim()) return;

      const trimmedText = rawText.trim();

      // STRICT ARTIFACT COMMAND FILTER:
      // Drop any casual conversation or uncommanded text immediately (0 chat bloat)
      if (!trimmedText.startsWith('/')) {
        return;
      }

      const isGroup = permissionChecker.isGroup(chatJid);
      const botContext = { botJid: this.botJid, botLid: this.botLid };
      const isOwner = isFromMe || adminCommands.isOwner(senderJid, isFromMe, botContext);
      const senderLabel = isOwner ? 'OWNER' : 'USER';

      // Non-owner direct messages (DMs) are dropped
      if (!isGroup && !isOwner) {
        return;
      }

      // 1. Check for Specialized Artifact Commands (/pdf, /ppt, /pptx, etc.)
      const resolvedSkill = skillResolver.resolve(trimmedText);
      if (resolvedSkill.isSkill && resolvedSkill.skill) {
        if (isGroup) {
          const canWrite = await permissionChecker.hasGroupWritePermission(this.sock, chatJid, this.botJid);
          if (!canWrite) return;
        }

        // Quota Check
        const quota = db.checkUserQuota(senderJid, isOwner);
        if (!quota.allowed) {
          logger.warn(`[QUOTA:REJECTED] User ${senderJid} exceeded daily limit (${quota.used}/${quota.limit})`);
          await this.dispatchMessage(chatJid, {
            text: `⚠️ *Daily Limit Reached* (${quota.used}/${quota.limit} used today)\n• Your quota resets in ~${quota.resetInHours}h (00:00 UTC).\n• Contact the bot owner to request VIP access!`
          }, isGroup, m);
          return;
        }

        // Anti-Spam Rate Limit
        if (!isOwner && !antiBan.checkRateLimit(senderJid)) {
          await this.dispatchMessage(chatJid, {
            text: `⏳ *Cooldown Active* — Please wait a few seconds before requesting another generation.`
          }, isGroup, m);
          return;
        }

        const quotedText = permissionChecker.extractQuotedText(m);
        const skillPrompt = resolvedSkill.prompt || quotedText || '';

        // Guide if topic missing
        if (!skillPrompt.trim()) {
          const cmdName = resolvedSkill.skillName === 'pptx' ? 'ppt' : resolvedSkill.skillName;
          await this.dispatchMessage(chatJid, {
            text: `*Usage:* \`/${cmdName} <topic or title>\`\n*Example:* \`/${cmdName} Artificial Intelligence in 2026\`\n\n_Tip: You can also reply to any message with /${cmdName} to convert that message!_`
          }, isGroup, m);
          return;
        }

        logger.info(`[ARTIFACT:START] Source: ${isGroup ? 'GROUP' : 'DM'} (${chatJid}) | Sender: ${senderLabel} (${senderJid}) | Type: ${resolvedSkill.skillName.toUpperCase()} | Prompt: "${skillPrompt.substring(0, 80)}"`);

        // Typing indicator
        await antiBan.applyHumanDelay(this.sock, chatJid);

        try {
          const skillResult = await resolvedSkill.skill.execute({
            prompt: skillPrompt,
            quotedText: quotedText || '',
            senderJid,
            isOwner,
            chatJid,
            isGroup
          });

          if (skillResult && skillResult.buffer) {
            const sent = await this.dispatchMessage(chatJid, {
              document: skillResult.buffer,
              mimetype: skillResult.mimetype || (resolvedSkill.skillName === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf'),
              fileName: skillResult.filename || `artifact.${resolvedSkill.skillName === 'pptx' ? 'pptx' : 'pdf'}`,
              caption: skillResult.caption || `Generated ${resolvedSkill.skillName.toUpperCase()}`
            }, isGroup, m);

            if (sent) {
              db.recordGeneration(senderJid, isOwner, {
                type: resolvedSkill.skillName,
                title: skillResult.title,
                pagesOrSlides: skillResult.pageCount || skillResult.slideCount || 1,
                latencyMs: skillResult.latencyMs || 0,
                modelUsed: skillResult.modelUsed || '',
                keyUsed: skillResult.keyUsed || ''
              });
              antiBan.recordReply(chatJid);
              logger.info(`[ARTIFACT:DELIVERED] ${skillResult.filename} dispatched successfully to ${chatJid}`);
            }
          }
        } catch (skillErr) {
          logger.error(`[ARTIFACT:ERROR] Generation failed:`, skillErr.stack || skillErr.message);
          await this.dispatchMessage(chatJid, {
            text: `❌ *Generation Error*: Could not generate ${resolvedSkill.skillName.toUpperCase()} at this moment. Please try again with a slightly different prompt!`
          }, isGroup, m);
        }
        return;
      }

      // 2. Handle Utility & Admin Commands (/help, /usage, /limit, /status, /stats, /keys, etc.)
      const commandResponse = await adminCommands.handleCommand(trimmedText, senderJid, isFromMe, botContext);
      if (commandResponse) {
        logger.info(`[COMMAND] Source: ${isGroup ? 'GROUP' : 'DM'} (${chatJid}) | Sender: ${senderLabel} (${senderJid}) | Command: "${trimmedText}"`);
        await this.dispatchMessage(chatJid, { text: commandResponse }, isGroup, m);
      }

    } catch (err) {
      logger.error('Message handling error:', err.stack || err.message);
    }
  }

  getStatus() {
    return {
      status: this.status,
      qrCodeDataUrl: this.qrCodeDataUrl,
      botJid: this.botJid,
      botLid: this.botLid,
      analytics: db.getAnalytics(),
      aiStatus: aiProvider.getStatus()
    };
  }
}

export const botEngine = new WhatsAppArtifactEngine();
export { BoundedTtlSet };
