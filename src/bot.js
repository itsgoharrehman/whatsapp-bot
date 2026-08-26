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
        browser: ['Artifact Engine', 'Chrome', '1.0.0'],
        // CRITICAL FOR LOW-RESOURCE SERVERS (Alwaysdata Free Tier: 256MB RAM / 0.25 CPU):
        syncFullHistory: false, // Prevents downloading & decrypting years of chat history (drops CPU from 100% to ~1% and RAM from 1GB to ~70MB)
        markOnlineOnConnect: false, // Minimizes presence traffic
        generateHighQualityLinkPreview: false, // Disables heavy image/link fetching
        getMessage: async () => undefined, // Prevents buffering full message history in RAM
        shouldIgnoreJid: (jid) => {
          if (!jid) return true;
          // Ignore status broadcasts and newsletters to save CPU/RAM
          return jid.endsWith('@broadcast') || jid.endsWith('@newsletter') || jid.includes('status@broadcast');
        },
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false,
        retryRequestDelayMs: 3000
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
          this.cleanupStalePreKeys();
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

  cleanupStalePreKeys() {
    try {
      if (!fs.existsSync(config.sessionDir)) return;
      const files = fs.readdirSync(config.sessionDir);
      const preKeyFiles = files.filter(f => f.startsWith('pre-key-'));
      if (preKeyFiles.length > 150) {
        const now = Date.now();
        let deleted = 0;
        for (const file of preKeyFiles) {
          const fullPath = path.join(config.sessionDir, file);
          try {
            const stat = fs.statSync(fullPath);
            if (now - stat.mtimeMs > 48 * 60 * 60 * 1000) {
              fs.unlinkSync(fullPath);
              deleted++;
            }
          } catch (e) {}
        }
        if (deleted > 0) {
          logger.info(`[SYSTEM] Pruned ${deleted} expired pre-key session files.`);
        }
      }
    } catch (err) {}
  }

  async syncGroupIdentities(chatJid) {
    if (!this.sock || !permissionChecker.isGroup(chatJid)) return;
    try {
      const metadata = await this.sock.groupMetadata(chatJid);
      if (metadata && Array.isArray(metadata.participants)) {
        for (const p of metadata.participants) {
          if (p.id && p.lid) {
            db.registerIdentity(p.id, p.lid);
          }
        }
      }
    } catch (err) {}
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
      logger.warn(`Primary send to ${chatJid} failed (${err.message}). Retrying unquoted...`);
      try {
        const res2 = await this.sock.sendMessage(chatJid, content);
        if (res2?.key?.id) {
          this.sentBotMsgIds.add(res2.key.id);
          this.sentBotMsgIds.add(`${chatJid}:${res2.key.id}`);
          this.processedInboundMsgIds.add(res2.key.id);
          this.processedInboundMsgIds.add(`${chatJid}:${res2.key.id}`);
        }
        return true;
      } catch (err2) {
        logger.error(`Send message to ${chatJid} failed:`, err2.message);
        return false;
      }
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

      const isGroup = permissionChecker.isGroup(chatJid);
      if (isGroup) {
        this.syncGroupIdentities(chatJid).catch(() => {});
      }

      // Drop stale messages (> 120s old) or corrupt future timestamps
      const rawTs = m.messageTimestamp;
      const msgTimestamp = typeof rawTs === 'object' && rawTs !== null ? (rawTs.low || Number(rawTs)) : Number(rawTs);
      if (msgTimestamp && !isNaN(msgTimestamp) && msgTimestamp > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - msgTimestamp > 120) return; // Drop messages older than 2 minutes
        if (msgTimestamp - nowSec > 60) return;  // Drop clock-drifted future messages
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

      const botContext = { botJid: this.botJid, botLid: this.botLid };
      const isOwner = isFromMe || adminCommands.isOwner(senderJid, isFromMe, botContext);
      const senderLabel = isOwner ? 'OWNER' : 'USER';

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
          await this.dispatchMessage(chatJid, {
            text: `*Daily Limit Reached* (${quota.used}/${quota.limit} used today)\n• Resets in ~${quota.resetInHours}h (00:00 UTC).\n• Contact the bot owner for VIP access.`
          }, isGroup, m);
          return;
        }

        // Anti-Spam Rate Limit
        if (!isOwner && !antiBan.checkRateLimit(senderJid)) {
          await this.dispatchMessage(chatJid, {
            text: `*Cooldown Active* - Please wait a few seconds before requesting another generation.`
          }, isGroup, m);
          return;
        }

        const quotedText = permissionChecker.extractQuotedText(m);
        const skillPrompt = resolvedSkill.prompt || quotedText || '';

        // Guide if topic missing
        if (!skillPrompt.trim()) {
          const cmdName = resolvedSkill.skillName === 'pptx' ? 'ppt' : resolvedSkill.skillName;
          await this.dispatchMessage(chatJid, {
            text: `*Usage:* \`/${cmdName} <topic> [--theme=<name>]\`\n*Example:* \`/${cmdName} Artificial Intelligence\`\n*Themes:* Type \`/themes\` to view all visual themes.`
          }, isGroup, m);
          return;
        }

        logger.info(`[${resolvedSkill.skillName.toUpperCase()}] Processing "${skillPrompt.substring(0, 50)}" from ${senderLabel}`);

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

          const docBuffer = skillResult?.buffer || skillResult?.content;
          if (skillResult && docBuffer) {
            const sent = await this.dispatchMessage(chatJid, {
              document: docBuffer,
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
              logger.info(`[${resolvedSkill.skillName.toUpperCase()}] Sent ${skillResult.filename} -> ${isGroup ? 'Group' : 'DM'}`);
            }
          }
        } catch (skillErr) {
          logger.error(`[${resolvedSkill.skillName.toUpperCase()}] Generation failed: ${skillErr.message}`);
          await this.dispatchMessage(chatJid, {
            text: `*Generation Error*: Could not generate ${resolvedSkill.skillName.toUpperCase()} at this moment. Please try again with a different prompt.`
          }, isGroup, m);
        }
        return;
      }

      // 2. Handle Utility & Admin Commands (/help, /themes, /usage, /vip, /unvip, /vips, /status)
      const commandResponse = await adminCommands.handleCommand(trimmedText, senderJid, isFromMe, botContext, m);
      if (commandResponse) {
        logger.info(`[COMMAND] "${trimmedText}" from ${senderLabel}`);
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
