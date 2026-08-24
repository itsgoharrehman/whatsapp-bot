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
  makeWASocket = baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  downloadMediaMessage = baileys.downloadMediaMessage;

  QRCode = (await import('qrcode')).default;
  pino = (await import('pino')).default;
} catch (err) {}

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

class WhatsAppBotEngine extends EventEmitter {
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

    // Clean up existing socket connection before starting a new one
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
        browser: ['Mark Zuckerberg', 'Chrome', '1.0.0']
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

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
          logger.info(`[SYSTEM] WhatsApp Bot Connected successfully! Logged in JID: ${this.botJid} (LID: ${this.botLid})`);
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
    logger.info('Resetting session & purging local credentials directory...');
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

  /**
   * Dispatches message safely with exactly ONE send call and records sent IDs immediately.
   */
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

      // 1. Message Timestamp & Stale Message / Sync Catch-up Filter
      const rawTs = m.messageTimestamp;
      const msgTimestamp = typeof rawTs === 'object' && rawTs !== null
        ? (rawTs.low || Number(rawTs))
        : Number(rawTs);

      if (msgTimestamp && !isNaN(msgTimestamp) && msgTimestamp > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        // Drop any message sent before current bot engine instance started (with 10s grace period)
        if (this.startTime && msgTimestamp < (this.startTime - 10)) {
          return;
        }
        // Drop any message older than 180 seconds from current clock
        if (nowSec - msgTimestamp > 180) {
          return;
        }
      }

      const botPhoneNum = permissionChecker.normalizeJid(this.botJid) || permissionChecker.normalizeJid(config.ownerNumber);
      const botLidNum = permissionChecker.normalizeJid(this.botLid);
      const senderNum = permissionChecker.normalizeJid(senderJid);

      // Check if message was dispatched by the bot itself
      const isBotSelf = isFromMe ||
        (this.botJid && senderJid === this.botJid) ||
        (botPhoneNum && senderNum === botPhoneNum && this.sentBotMsgIds.has(msgId)) ||
        (botLidNum && senderNum === botLidNum) ||
        this.sentBotMsgIds.has(msgId);

      // Inbound Message Deduplication: Prevent duplicate processing of the same message event
      const dedupeKey = `${chatJid}:${msgId}`;
      if (this.processedInboundMsgIds.has(dedupeKey) || this.processedInboundMsgIds.has(msgId)) {
        return;
      }
      // Immediately mark as seen/processing to prevent concurrent race conditions
      this.processedInboundMsgIds.add(dedupeKey);
      this.processedInboundMsgIds.add(msgId);

      // Ignore outgoing messages sent by the bot engine itself to prevent loops
      if (this.sentBotMsgIds.has(msgId)) {
        return;
      }

      const unwrapped = permissionChecker.unwrapMessage(m);
      if (!unwrapped) return;

      const hasMedia = permissionChecker.hasMedia(unwrapped);
      const mediaType = permissionChecker.detectMediaType(unwrapped);

      // VIDEO RULE: Completely ignore video messages without AI processing or rejection notices
      if (mediaType === 'video' || unwrapped.videoMessage) {
        return;
      }

      const rawText = permissionChecker.extractMessageText(unwrapped);
      const messageText = rawText || (hasMedia ? `[${mediaType.toUpperCase()} Message]` : '');
      if (!messageText || !messageText.trim()) return;

      const trimmedText = messageText.trim();

      // Bot Signature & Echo Filter: Instantly drop any message containing bot outputs to prevent loops
      if (
        trimmedText.startsWith('*Control Panel*') ||
        trimmedText.startsWith('📄 Generated Document:') ||
        trimmedText.startsWith('📊 Generated Presentation:') ||
        trimmedText.startsWith('[Sent Document:') ||
        trimmedText.startsWith('*Mark Zuckerberg*') ||
        trimmedText.startsWith('Sorry, there was an issue') ||
        trimmedText.startsWith("Sorry, WhatsApp couldn't download")
      ) {
        return;
      }

      const isGroup = permissionChecker.isGroup(chatJid);

      // In group chats: the bot MUST NEVER reply to its own messages or fromMe messages
      if (isGroup && isBotSelf) {
        return;
      }

      const botContext = { botJid: this.botJid, botLid: this.botLid };
      const isOwner = isFromMe || adminCommands.isOwner(senderJid, isFromMe, botContext);
      const senderLabel = isOwner ? 'OWNER' : 'USER';

      // In DMs: if sent by me / self, ONLY proceed if it's an explicit command (starts with '/') or explicit bot mention (@mark)
      if (!isGroup && isFromMe) {
        const isCommand = trimmedText.startsWith('/');
        const isMention = trimmedText.toLowerCase().includes('@mark') ||
          trimmedText.toLowerCase().includes('@zuck') ||
          (botPhoneNum && trimmedText.includes(`@${botPhoneNum}`));
        if (!isCommand && !isMention) {
          return;
        }
      }

      // Handle Admin Commands (/help, /status, /auto, /chat, /voice, /image, etc.)
      if (trimmedText.startsWith('/')) {
        const commandResponse = await adminCommands.handleCommand(trimmedText, senderJid, isFromMe, botContext);
        if (commandResponse) {
          logger.info(`[COMMAND] Source: ${isGroup ? 'GROUP' : 'DM'} (${chatJid}) | Sender: ${senderLabel} (${senderJid}) | Command: "${trimmedText}" | Status: EXECUTED`);
          await this.dispatchMessage(chatJid, { text: commandResponse }, isGroup, m);
          return;
        }
      }

      // MASTER AUTO-REPLY KILLSWITCH (for ALL messages: text, voice, images, skills)
      if (!db.getAutoReply()) {
        return;
      }

      // SUB-SWITCH CHECKS FOR SPECIFIC MESSAGE TYPES
      if ((mediaType === 'audio' || mediaType === 'voice' || unwrapped.audioMessage) && !db.getVoiceReply()) {
        return;
      }
      if ((mediaType === 'image' || unwrapped.imageMessage) && !db.getImageReply()) {
        return;
      }
      if (!hasMedia && !db.getChatReply()) {
        return;
      }

      // Check for Specialized Skill Invocations (@mark(pdf), etc.)
      const resolvedSkill = skillResolver.resolve(trimmedText, { botPhoneNum });
      if (resolvedSkill.isSkill && resolvedSkill.skill) {
        if (isGroup) {
          const canWrite = await permissionChecker.hasGroupWritePermission(this.sock, chatJid, this.botJid);
          if (!canWrite) return;
        }

        if (!db.getAutoReply()) return;
        if (!antiBan.checkRateLimit(chatJid)) return;

        const quotedText = permissionChecker.extractQuotedText(m);
        const skillPrompt = resolvedSkill.prompt || quotedText || '';

        // If skill was invoked without prompt and without quoted text, guide the user
        if (!skillPrompt.trim()) {
          await this.dispatchMessage(chatJid, {
            text: `Please specify a topic for the ${resolvedSkill.skillName.toUpperCase()} skill. Example:\n*@mark(${resolvedSkill.skillName}) Project overview and timeline*`
          }, isGroup, m);
          return;
        }

        logger.info(`[SKILL] Source: ${isGroup ? 'GROUP' : 'DM'} (${chatJid}) | Sender: ${senderLabel} (${senderJid || 'me'}) | Skill: "${resolvedSkill.skillName.toUpperCase()}" | Prompt: "${skillPrompt.substring(0, 100)}"${quotedText ? ' [Quoted Context]' : ''}`);

        // Apply human typing delay
        await antiBan.applyHumanDelay(this.sock, chatJid);

        try {
          const skillContext = {
            prompt: skillPrompt,
            quotedText: quotedText || '',
            senderJid,
            isOwner,
            chatJid,
            isGroup,
            rawMessage: messageText,
            m
          };

          const skillResult = await resolvedSkill.skill.execute(skillContext);

          if (skillResult && skillResult.type === 'document' && skillResult.content) {
            const sent = await this.dispatchMessage(chatJid, {
              document: skillResult.content,
              mimetype: skillResult.mimetype || 'application/pdf',
              fileName: skillResult.filename || 'document.pdf',
              caption: skillResult.caption || `📄 Generated Document: *${skillResult.title || 'PDF'}*`
            }, isGroup, m);

            if (sent) {
              db.addMessage(chatJid, 'user', messageText, senderJid, isOwner);
              db.addMessage(chatJid, 'assistant', `[Sent Document: ${skillResult.filename || 'document.pdf'}]`, this.botJid, false);
              antiBan.recordReply(chatJid);
              logger.info(`[SKILL:DISPATCH] Target: ${chatJid} | Document: ${skillResult.filename} | Status: DELIVERED`);
            }
            return;
          } else if (skillResult && (skillResult.type === 'text' || typeof skillResult === 'string')) {
            const textContent = typeof skillResult === 'string' ? skillResult : skillResult.content;
            if (textContent && textContent.trim()) {
              const sent = await this.dispatchMessage(chatJid, { text: textContent.trim() }, isGroup, m);
              if (sent) {
                db.addMessage(chatJid, 'user', messageText, senderJid, isOwner);
                db.addMessage(chatJid, 'assistant', textContent.trim(), this.botJid, false);
                antiBan.recordReply(chatJid);
                logger.info(`[SKILL:DISPATCH] Target: ${chatJid} | Status: DELIVERED`);
              }
              return;
            }
          }
        } catch (skillErr) {
          logger.error(`[SKILL:ERROR] Failed executing skill '${resolvedSkill.skillName}':`, skillErr.stack || skillErr.message);
          await this.dispatchMessage(chatJid, { text: `Sorry, there was an issue generating your ${resolvedSkill.skillName.toUpperCase()} document. Please try again with a slightly different prompt!` }, isGroup, m);
          return;
        }
      }

      // Group Message Trigger Logic (Works for both owner and members with @mark, @<botNumber>, or quote to bot)
      if (isGroup) {
        const isMentioned = permissionChecker.isBotMentionedInGroup(m, this.botJid, this.botLid, messageText, senderJid, this.sentBotMsgIds);
        if (!isMentioned) return;

        const canWrite = await permissionChecker.hasGroupWritePermission(this.sock, chatJid, this.botJid);
        if (!canWrite) return;
      }

      if (!db.getAutoReply()) return;
      if (!antiBan.checkRateLimit(chatJid)) return;

      logger.info(`[INPUT] Source: ${isGroup ? 'GROUP' : 'DM'} (${chatJid}) | Sender: ${senderLabel} (${senderJid || 'me'}) | Prompt: "${messageText.substring(0, 100)}"${hasMedia ? ` [Media: ${mediaType}]` : ''}`);

      const history = db.getConversationHistory(chatJid);

      // Extract quoted message context if present
      const quotedText = permissionChecker.extractQuotedText(m);
      let promptToSend = rawText || '';
      if (quotedText && quotedText.trim()) {
        logger.info(`[CONTEXT] Quoted message detected: "${quotedText.substring(0, 100)}"`);
        promptToSend = `[Replying to quoted message]: "${quotedText.trim()}"\n${promptToSend || messageText}`;
      }

      // Download media buffer if available for multimodal processing
      let mediaBase64 = null;
      let mediaMimeType = null;
      if (hasMedia) {
        if (mediaType === 'video' && unwrapped.videoMessage?.jpegThumbnail) {
          mediaBase64 = Buffer.from(unwrapped.videoMessage.jpegThumbnail).toString('base64');
          mediaMimeType = 'image/jpeg';
        } else if (typeof downloadMediaMessage === 'function') {
          try {
            const buffer = await downloadMediaMessage(m, 'buffer', {});
            if (buffer && Buffer.isBuffer(buffer)) {
              mediaBase64 = buffer.toString('base64');
              mediaMimeType = unwrapped.imageMessage?.mimetype || unwrapped.audioMessage?.mimetype || unwrapped.videoMessage?.mimetype || 'image/jpeg';
            }
          } catch (mediaErr) {
            logger.warn(`Media download warning (${mediaErr.message}).`);
          }
        }

        // Graceful error if media was present but download completely failed
        if (!mediaBase64 && (mediaType === 'image' || mediaType === 'audio' || mediaType === 'voice')) {
          logger.warn(`[MEDIA] Media download failed for ${mediaType} from ${senderJid}. Sending user notification.`);
          await this.dispatchMessage(chatJid, { text: `Sorry, WhatsApp couldn't download that ${mediaType === 'image' ? 'image' : 'audio message'}. Please try sending it again!` }, isGroup, m);
          return;
        }
      }

      // Apply silent pause followed by typing animation
      await antiBan.applyHumanDelay(this.sock, chatJid);

      // Generate AI response from active AI Provider (NVIDIA / Groq)
      let aiReply = '';
      try {
        aiReply = await aiProvider.generateResponse(promptToSend || messageText, history, {
          messageId: msgId,
          chatId: chatJid,
          isOwner: isOwner,
          isMedia: hasMedia,
          mediaType: mediaType,
          mediaBase64: mediaBase64,
          mediaMimeType: mediaMimeType
        });
      } catch (aiErr) {
        logger.error(`AI generation error for ${chatJid}:`, aiErr.message);
      }

      // Only dispatch and store if a valid, non-empty user-facing reply was generated
      if (this.sock && aiReply && typeof aiReply === 'string' && aiReply.trim()) {
        const validatedReply = aiReply.trim();
        const sent = await this.dispatchMessage(chatJid, { text: validatedReply }, isGroup, m);
        if (sent) {
          db.addMessage(chatJid, 'user', messageText, senderJid, isOwner);
          db.addMessage(chatJid, 'assistant', validatedReply, this.botJid, false);
          antiBan.recordReply(chatJid);
          logger.info(`[DISPATCH] Target: ${chatJid} | Status: DELIVERED`);
        }
      } else {
        logger.warn(`No valid user-facing AI reply generated for ${chatJid}. Conversation history left unchanged.`);
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
      autoReply: db.getAutoReply(),
      analytics: db.getAnalytics(),
      aiStatus: aiProvider.getStatus(),
      groqStatus: aiProvider.getStatus()
    };
  }
}

export const botEngine = new WhatsAppBotEngine();
export { BoundedTtlSet };

