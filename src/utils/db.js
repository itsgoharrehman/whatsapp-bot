import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from './logger.js';

class JsonDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      conversations: {},
      settings: { autoReply: true, voiceReply: true, imageReply: true },
      analytics: { totalMessagesProcessed: 0, totalRepliesSent: 0, rateLimitedCount: 0, keyRotationsCount: 0 },
      rules: []
    };
    this.init();
  }

  init() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          conversations: parsed.conversations || {},
          settings: {
            autoReply: true,
            voiceReply: true,
            imageReply: true,
            ...(parsed.settings || {})
          },
          analytics: { ...this.data.analytics, ...(parsed.analytics || {}) },
          rules: parsed.rules || []
        };
        this.sanitizeStoredConversations();
      } else {
        this.save();
      }
    } catch (err) {
      logger.error('Database reset to default schema.', err.message);
      this.save();
    }
  }

  sanitizeStoredConversations() {
    let modified = false;
    for (const jid of Object.keys(this.data.conversations)) {
      const conv = this.data.conversations[jid];
      if (conv && Array.isArray(conv.messages)) {
        const cleanedMsgs = [];
        for (const msg of conv.messages) {
          if (!msg || !msg.content || typeof msg.content !== 'string') continue;

          // Remove bot control panel echoes or unauthorized error traces from history
          if (msg.content.includes('*Control Panel* › *Access Denied*') || msg.content.includes('ye command sirf Gohar bhai ko hi milta hai')) {
            modified = true;
            continue;
          }

          if (msg.role === 'assistant') {
            let cleaned = msg.content
              .replace(/<(think|thought|reasoning|reflection|analysis|details|inner_monologue)>[\s\S]*?<\/\1>/gi, '')
              .replace(/<(think|thought|reasoning|reflection|analysis|details|inner_monologue)>[\s\S]*/gi, '');

            const finalMatch = cleaned.match(/(?:^|\n)(?:#{1,4}\s*)?(?:\*\*)?(?:Final\s+(?:Response|Answer|Output|Message)|Conversational\s+Reply|Direct\s+Reply|Message|Final:)(?:\*\*)?:?\s*\n*([\s\S]*)$/i);
            if (finalMatch && finalMatch[1] && finalMatch[1].trim()) {
              cleaned = finalMatch[1];
            } else {
              cleaned = cleaned
                .replace(/(?:^|\n)(?:Here's\s+a\s+thinking\s+process:?|Thinking\s+Process:?|Thought\s+Process:?|Internal\s+Reasoning:?)[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/gi, '')
                .replace(/(?:^|\n)(?:#{1,4}\s*)?(?:\*\*)?(?:Role\s*(?:&|and)\s*Ambition|User\s*Profile|Persona(?:\s*Analysis)?|Goals|Current\s*Actions|Architecture\s*Insight|System\s*Architecture|Draft\s*Response|Refine\s*(?:\([^)]*\))?|Final\s*Check)(?:\*\*)?:?[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/gi, '')
                .replace(/^(?:Let's\s+(?:see|analyze|check|think)|Analyzing\s+user|The user is|Okay,?\s+the user)[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/gim, '');
            }
            cleaned = cleaned.trim();
            if (cleaned && !/^(?:Done\.|Proceeds\.|Ready\.|\*?\*?Role\b.*)$/im.test(cleaned)) {
              cleanedMsgs.push({ ...msg, content: cleaned });
            } else {
              modified = true;
            }
          } else {
            cleanedMsgs.push(msg);
          }
        }
        if (cleanedMsgs.length !== conv.messages.length) modified = true;
        conv.messages = cleanedMsgs;
      }
    }
    if (modified) {
      this.save();
      logger.info('Database history sanitized: removed stale leaked reasoning and loop records.');
    }
  }

  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = JSON.stringify(this.data, null, 2);
      try {
        fs.writeFileSync(this.filePath, payload, 'utf8');
      } catch (writeErr) {
        // In case another process holds db.json open on Windows, write to temp and rename
        const tempPath = `${this.filePath}.${Date.now()}.tmp`;
        try {
          fs.writeFileSync(tempPath, payload, 'utf8');
          fs.renameSync(tempPath, this.filePath);
        } catch (_) {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (__) {}
        }
      }
    } catch (err) {
      logger.error('Error saving database:', err.message);
    }
  }

  getConversationHistory(jid) {
    return this.data.conversations[jid]?.messages || [];
  }

  addMessage(jid, role, content, senderJid = null, isOwner = false) {
    if (!content || typeof content !== 'string' || !content.trim()) return;
    if (!this.data.conversations[jid]) {
      this.data.conversations[jid] = { updatedAt: new Date().toISOString(), messages: [] };
    }
    const messages = this.data.conversations[jid].messages;
    messages.push({
      role,
      content: content.trim(),
      senderJid: senderJid || null,
      isOwner: Boolean(isOwner),
      timestamp: new Date().toISOString()
    });
    if (messages.length > 20) {
      this.data.conversations[jid].messages = messages.slice(-20);
    }
    this.data.conversations[jid].updatedAt = new Date().toISOString();
    if (role === 'user') {
      this.data.analytics.totalMessagesProcessed = (this.data.analytics.totalMessagesProcessed || 0) + 1;
    }
    this.save();
  }

  getAutoReply() { return this.data.settings.autoReply !== false; }
  setAutoReply(enabled) { this.data.settings.autoReply = Boolean(enabled); this.save(); }

  getChatReply() { return this.data.settings.chatReply !== false; }
  setChatReply(enabled) { this.data.settings.chatReply = Boolean(enabled); this.save(); }

  getVoiceReply() { return this.data.settings.voiceReply !== false; }
  setVoiceReply(enabled) { this.data.settings.voiceReply = Boolean(enabled); this.save(); }

  getImageReply() { return this.data.settings.imageReply !== false; }
  setImageReply(enabled) { this.data.settings.imageReply = Boolean(enabled); this.save(); }

  getProvider() {
    return (this.data.settings.provider || config.defaultProvider || 'nvidia').toLowerCase();
  }

  setProvider(provider) {
    const valid = ['groq', 'nvidia', 'auto'];
    const p = (provider || '').toLowerCase();
    if (!valid.includes(p)) throw new Error(`Invalid provider '${provider}'. Valid choices: ${valid.join(', ')}`);
    this.data.settings.provider = p;
    this.save();
    return p;
  }

  incrementMetric(key) {
    if (typeof this.data.analytics[key] === 'number') {
      this.data.analytics[key] += 1;
    } else {
      this.data.analytics[key] = 1;
    }
    this.save();
  }

  resetAllData() {
    this.data.conversations = {};
    this.data.analytics = {
      totalMessagesProcessed: 0,
      totalRepliesSent: 0,
      rateLimitedCount: 0,
      keyRotationsCount: 0
    };
    this.save();
    return true;
  }

  clearContext(jid) {
    if (this.data.conversations[jid]) {
      delete this.data.conversations[jid];
      this.save();
      return true;
    }
    return false;
  }

  getRules() {
    return this.data.rules || [];
  }

  addRule(ruleText) {
    if (!this.data.rules) this.data.rules = [];
    this.data.rules.push(ruleText);
    this.save();
    return true;
  }

  removeRule(index) {
    if (!this.data.rules || index < 1 || index > this.data.rules.length) return false;
    this.data.rules.splice(index - 1, 1);
    this.save();
    return true;
  }

  clearRules() {
    this.data.rules = [];
    this.save();
    return true;
  }

  getAnalytics() { return { ...this.data.analytics }; }
}

export const db = new JsonDatabase(config.dbFilePath);
