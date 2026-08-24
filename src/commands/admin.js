import { config } from '../config.js';
import { db } from '../utils/db.js';
import { aiProvider } from '../ai/provider.js';
import { skillLoader } from '../skills/loader.js';

function formatChain(primary, fallbacks) {
  if (!primary) return 'N/A';
  const f = Array.isArray(fallbacks) ? fallbacks.join(', ') : fallbacks;
  if (!f || f === 'undefined') return primary;
  return `${primary}\n  ↳ _fallback_: ${f}`;
}

function formatProviderDetails(pName, pObj) {
  if (!pObj) return '';
  const isGroq = (pName || '').toLowerCase() === 'groq';
  const routerChain = formatChain(pObj.routerModel, pObj.routerFallbackModels);
  const simpleChain = formatChain(pObj.simpleModel, pObj.simpleFallbackModels);
  const reasoningChain = formatChain(pObj.reasoningModel, pObj.reasoningFallbackModels);
  const pdfChain = formatChain(pObj.pdfModel || pObj.reasoningModel, pObj.pdfFallbackModels || pObj.reasoningFallbackModels);
  const pptxChain = formatChain(pObj.pptxModel || pObj.reasoningModel, pObj.pptxFallbackModels || pObj.reasoningFallbackModels);
  const multimodalChain = formatChain(pObj.multimodalModel, pObj.multimodalFallbackModels);
  const defaultAudio = isGroq ? 'whisper-large-v3-turbo' : 'nvidia/nemotron-asr-streaming';
  const defaultAudioFallback = isGroq ? 'whisper-large-v3' : 'nvidia/nemotron-voicechat';
  const audioChain = formatChain(pObj.audioModel || defaultAudio, pObj.audioFallbackModels || defaultAudioFallback);

  return `• *Selector (Router)* : ${routerChain}
• *Chat (Simple)* : ${simpleChain}
• *Reasoning* : ${reasoningChain}
• *PDF Generation* : ${pdfChain}
• *PPT Generation* : ${pptxChain}
• *Multimodal (Vision/Image)* : ${multimodalChain}
• *Audio (Speech/Voice)* : ${audioChain}`;
}

export default {
  isOwner(senderJid, isFromMe = false, botContext = {}) {
    if (isFromMe) return true;
    if (!senderJid) return false;
    const senderNumber = senderJid.split('@')[0].split(':')[0];
    if (config.ownerNumber && senderNumber === config.ownerNumber) return true;
    if (botContext.botJid && senderNumber === botContext.botJid.split('@')[0].split(':')[0]) return true;
    if (botContext.botLid && (senderJid === botContext.botLid || senderNumber === botContext.botLid.split('@')[0].split(':')[0])) return true;
    return false;
  },

  formatUptime() {
    const seconds = Math.floor(process.uptime());
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  },

  async handleCommand(commandText, senderJid, isFromMe = false, botContext = {}) {
    const trimmed = commandText.trim();
    if (!trimmed.startsWith('/')) return null;
    if (!this.isOwner(senderJid, isFromMe, botContext)) {
      return `*Control Panel* › *Access Denied*\n────────────────────\n• *Status* : Unauthorized\n• *Detail* : Owner verification required\n────────────────────`;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (cmd === '/help') {
      return `*Control Panel* › *Help*\n────────────────────\n• */auto* ── Master switch for all auto-replies [ on | off ]\n• */chat* ── Toggle text chat reply [ on | off ]\n• */voice* ── Toggle voice message processing [ on | off ]\n• */image* ── Toggle image processing [ on | off ]\n• */status* ── System metrics & active state\n• */models* ── AI architecture & fallback tree\n• */skills* ── Loaded skills & syntax\n• */provider* ── Select provider [ groq | nvidia | auto ]\n• */rotate* ── Rotate active key [ groq | nvidia ]\n• */reset* ── Clear context or database [ chat | all ]\n• */rule* ── Dynamic rules [ add | list | rm | clear ]\n• */help* ── Display command menu\n────────────────────\n*Skill Triggers:*\n• *@mark(pdf)* <topic> ── Generate formatted PDF document\n• *@mark(pptx)* <topic> ── Generate PowerPoint presentation`;
    }

    if (cmd === '/status') {
      const analytics = db.getAnalytics();
      const statusInfo = aiProvider.getStatus();
      const activeP = statusInfo.activeProvider.toUpperCase();
      const activeDetails = statusInfo[statusInfo.activeProvider] || statusInfo.groq;
      const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);

      return `*Control Panel* › *Status*\n────────────────────\n*SYSTEM METRICS*\n• *State* : ONLINE\n• *Uptime* : ${this.formatUptime()}\n• *RAM Usage* : ${mem} MB\n• *Master Auto-Reply (All)* : ${db.getAutoReply() ? 'ENABLED' : 'DISABLED'}\n• *Chat (Text)* : ${db.getChatReply() ? 'ENABLED' : 'DISABLED'}\n• *Voice (Audio)* : ${db.getVoiceReply() ? 'ENABLED' : 'DISABLED'}\n• *Images* : ${db.getImageReply() ? 'ENABLED' : 'DISABLED'}\n\n*AI ENGINE*\n• *Provider* : ${activeP}\n• *Active Key* : #${activeDetails.activeKeyIndex + 1} (${activeDetails.activeMaskedKey})\n• *Key Rotations* : ${analytics.keyRotationsCount || 0}\n\n*MESSAGE ANALYTICS*\n• *Processed* : ${analytics.totalMessagesProcessed || 0} msgs\n• *Replies Sent* : ${analytics.totalRepliesSent || 0}\n\n*ACTIVE MODELS*\n${formatProviderDetails(statusInfo.activeProvider, activeDetails)}\n────────────────────`;
    }

    if (cmd === '/models') {
      const statusInfo = aiProvider.getStatus();
      return `*Control Panel* › *Models*\n────────────────────\n*NVIDIA (NIM)*\n${formatProviderDetails('nvidia', statusInfo.nvidia)}\n\n────────────────────\n*GROQ*\n${formatProviderDetails('groq', statusInfo.groq)}\n────────────────────`;
    }

    if (cmd === '/skills') {
      const list = skillLoader.listSkills();
      if (!list || list.length === 0) {
        return `*Control Panel* › *Skills Engine*\n────────────────────\n_No skills currently registered._\n────────────────────`;
      }
      const skillsFormatted = list.map(s => {
        const aliases = s.aliases && s.aliases.length > 0 ? ` (aliases: ${s.aliases.join(', ')})` : '';
        return `• *${s.name.toUpperCase()}*${aliases}\n  ↳ _Usage_: \`${s.usage}\`\n  ↳ _Info_: ${s.description}`;
      }).join('\n\n');

      return `*Control Panel* › *Skills Engine*\n────────────────────\n${skillsFormatted}\n\n*Trigger Pattern:*\n• *@mark(skill_name) <prompt>*\n────────────────────`;
    }

    if (cmd === '/provider') {
      const target = (args[0] || '').toLowerCase();
      if (!target) {
        const currentP = db.getProvider().toUpperCase();
        const info = aiProvider.getStatus();
        const currentDetails = info[info.activeProvider] || info.groq;
        return `*Control Panel* › *Provider*\n────────────────────\n• *Active Provider* : ${currentP}\n• *Active Key* : #${currentDetails.activeKeyIndex + 1} (${currentDetails.activeMaskedKey})\n\n*ACTIVE MODELS*\n${formatProviderDetails(info.activeProvider, currentDetails)}\n\n*OPTIONS*\n• /provider groq\n• /provider nvidia\n• /provider auto\n────────────────────`;
      }

      try {
        const updated = aiProvider.setProvider(target);
        const info = aiProvider.getStatus();
        const newDetails = info[updated] || info.groq;
        return `*Control Panel* › *Provider Updated*\n────────────────────\n• *New Provider* : ${updated.toUpperCase()}\n• *Active Key* : #${newDetails.activeKeyIndex + 1} (${newDetails.activeMaskedKey})\n\n*ACTIVE MODELS*\n${formatProviderDetails(updated, newDetails)}\n────────────────────`;
      } catch (err) {
        return `*Control Panel* › *Provider Error*\n────────────────────\n• *Error* : ${err.message}\n• *Options* : [ groq | nvidia | auto ]\n────────────────────`;
      }
    }

    if (cmd === '/rotate') {
      const targetProvider = (args[0] || '').toLowerCase() || null;
      const res = aiProvider.rotateKey(targetProvider);
      return `*Control Panel* › *Key Rotation*\n────────────────────\n• *Provider* : ${res.provider.toUpperCase()}\n• *Rotated* : ${res.rotated ? 'YES' : 'NO'}\n• *Key Index* : #${res.index + 1} of ${res.total}\n• *Active Key* : ${res.key}\n────────────────────`;
    }

    if (cmd === '/reset') {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'chat') {
        db.clearContext(senderJid);
        return `*Control Panel* › *Chat Reset*\n────────────────────\n• *Target* : Current Chat\n• *Status* : History cleared successfully\n────────────────────`;
      }

      db.resetAllData();
      return `*Control Panel* › *Database Reset*\n────────────────────\n• *Conversations* : Cleared (0 active)\n• *Statistics* : Reset to 0\n• *Master Auto-Reply* : ${db.getAutoReply() ? 'ENABLED' : 'DISABLED'}\n• *Chat* : ${db.getChatReply() ? 'ENABLED' : 'DISABLED'}\n• *Voice* : ${db.getVoiceReply() ? 'ENABLED' : 'DISABLED'}\n• *Images* : ${db.getImageReply() ? 'ENABLED' : 'DISABLED'}\n• *Status* : Fresh start ready\n────────────────────`;
    }

    if (cmd === '/auto') {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'on') {
        db.setAutoReply(true);
        return `*Control Panel* › *Master Auto-Reply (All Messages)*\n────────────────────\n• *State* : ENABLED (Global)\n• *Detail* : AI responses enabled for all message types\n────────────────────`;
      }
      if (sub === 'off') {
        db.setAutoReply(false);
        return `*Control Panel* › *Master Auto-Reply (All Messages)*\n────────────────────\n• *State* : DISABLED (Global)\n• *Detail* : All incoming messages and skills silenced\n────────────────────`;
      }
      return `*Control Panel* › *Master Auto-Reply (All Messages)*\n────────────────────\n• *Current State* : ${db.getAutoReply() ? 'ENABLED' : 'DISABLED'}\n• *Usage* : /auto on | /auto off\n────────────────────`;
    }

    if (cmd === '/chat') {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'on') {
        db.setChatReply(true);
        return `*Control Panel* › *Text Chat Auto-Reply*\n────────────────────\n• *State* : ENABLED\n────────────────────`;
      }
      if (sub === 'off') {
        db.setChatReply(false);
        return `*Control Panel* › *Text Chat Auto-Reply*\n────────────────────\n• *State* : DISABLED\n────────────────────`;
      }
      return `*Control Panel* › *Text Chat Auto-Reply*\n────────────────────\n• *Current State* : ${db.getChatReply() ? 'ENABLED' : 'DISABLED'}\n• *Usage* : /chat on | /chat off\n────────────────────`;
    }

    if (cmd === '/voice') {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'on') {
        db.setVoiceReply(true);
        return `*Control Panel* › *Voice Note Processing*\n────────────────────\n• *State* : ENABLED\n────────────────────`;
      }
      if (sub === 'off') {
        db.setVoiceReply(false);
        return `*Control Panel* › *Voice Note Processing*\n────────────────────\n• *State* : DISABLED\n────────────────────`;
      }
      return `*Control Panel* › *Voice Note Processing*\n────────────────────\n• *Current State* : ${db.getVoiceReply() ? 'ENABLED' : 'DISABLED'}\n• *Usage* : /voice on | /voice off\n────────────────────`;
    }

    if (cmd === '/image' || cmd === '/images') {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'on') {
        db.setImageReply(true);
        return `*Control Panel* › *Image Processing*\n────────────────────\n• *State* : ENABLED\n────────────────────`;
      }
      if (sub === 'off') {
        db.setImageReply(false);
        return `*Control Panel* › *Image Processing*\n────────────────────\n• *State* : DISABLED\n────────────────────`;
      }
      return `*Control Panel* › *Image Processing*\n────────────────────\n• *Current State* : ${db.getImageReply() ? 'ENABLED' : 'DISABLED'}\n• *Usage* : /image on | /image off\n────────────────────`;
    }

    if (cmd === '/rule') {
      const sub = (args[0] || '').toLowerCase();
      
      if (sub === 'add') {
        const ruleText = args.slice(1).join(' ').trim();
        if (!ruleText) return `*Control Panel* › *Rule Error*\n────────────────────\n• *Error* : Rule text cannot be empty\n• *Usage* : /rule add <text>\n────────────────────`;
        db.addRule(ruleText);
        return `*Control Panel* › *Rule Added*\n────────────────────\n• *Saved* : "${ruleText}"\n────────────────────`;
      }
      
      if (sub === 'list') {
        const rules = db.getRules();
        if (!rules || rules.length === 0) return `*Control Panel* › *Dynamic Rules*\n────────────────────\n_No rules found._\n────────────────────`;
        const list = rules.map((r, i) => `• *${i + 1}.* ${r}`).join('\n');
        return `*Control Panel* › *Dynamic Rules*\n────────────────────\n${list}\n────────────────────`;
      }
      
      if (sub === 'rm') {
        const idx = parseInt(args[1], 10);
        if (isNaN(idx)) return `*Control Panel* › *Rule Error*\n────────────────────\n• *Error* : Provide a valid number\n• *Usage* : /rule rm <number>\n────────────────────`;
        const success = db.removeRule(idx);
        if (success) return `*Control Panel* › *Rule Removed*\n────────────────────\n• *Status* : Rule #${idx} deleted\n────────────────────`;
        return `*Control Panel* › *Rule Error*\n────────────────────\n• *Error* : Rule #${idx} not found\n────────────────────`;
      }
      
      if (sub === 'clear') {
        db.clearRules();
        return `*Control Panel* › *Rules Cleared*\n────────────────────\n• *Status* : All dynamic memory rules removed\n────────────────────`;
      }
      
      return `*Control Panel* › *Rules*\n────────────────────\n• /rule add <text>\n• /rule list\n• /rule rm <number>\n• /rule clear\n────────────────────`;
    }

    return `*Control Panel* › *Unknown Command*\n────────────────────\n• *Command* : ${cmd}\n• *Action* : Type */help* for available commands\n────────────────────`;
  }
};
