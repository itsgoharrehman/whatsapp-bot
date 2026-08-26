import { config } from '../config.js';
import { db } from '../utils/db.js';
import { aiProvider, VALID_PDF_THEMES, VALID_PPTX_THEMES } from '../ai/provider.js';
import permissionChecker from '../utils/permissionChecker.js';

export default {
  isOwner(senderJid, isFromMe = false, botContext = {}) {
    if (isFromMe) return true;
    if (!senderJid) return false;
    const senderNumber = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    
    // Check against configured owner numbers
    const ownerList = config.ownerNumbers || (config.ownerNumber ? [config.ownerNumber.replace(/[^0-9]/g, '')] : []);
    if (ownerList.some(o => o && (senderNumber === o || senderNumber.endsWith(o) || o.endsWith(senderNumber)))) {
      return true;
    }
    if (botContext.botJid && (senderNumber === botContext.botJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') || senderJid === botContext.botJid)) return true;
    if (botContext.botLid && (senderJid === botContext.botLid || senderNumber === botContext.botLid.split('@')[0].split(':')[0].replace(/[^0-9]/g, ''))) return true;
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

  async handleCommand(commandText, senderJid, isFromMe = false, botContext = {}, rawMsg = null) {
    const trimmed = commandText.trim();
    if (!trimmed.startsWith('/')) return null;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Bypass skills so SkillResolver handles them directly
    if (cmd === '/pdf' || cmd === '/ppt' || cmd === '/pptx' || cmd === '/doc' || cmd === '/skill') {
      return null;
    }

    const isOwnerUser = this.isOwner(senderJid, isFromMe, botContext);
    const senderNum = db.resolveDisplayPhone(senderJid);

    // ==========================================
    // PUBLIC USER COMMANDS
    // ==========================================
    if (cmd === '/help') {
      return `*Artifact Engine Help*
----------------------------------------
*Document Generation:*
• */pdf <topic> [--theme=<name>]*
  Generate a formatted PDF document.
  Default theme: editorial_clean

• */ppt <topic> [--theme=<name>]*
  Generate an executive PowerPoint (.pptx) presentation.
  Default theme: modern_minimal

• */themes*
  List all available PDF and PowerPoint visual themes.

*Quota & Account:*
• */usage*
  Check your remaining daily generation quota.

*Owner Controls:*
• */provider* (or /provider groq|nvidia)
• */vip <phone/lid>* (or reply /vip)
• */unvip <phone/lid>* (or reply /unvip)
• */vips*
• */status*
----------------------------------------`;
    }

    if (cmd === '/themes') {
      const pdfThemesFormatted = VALID_PDF_THEMES.map(t => `• ${t} ${t === 'editorial_clean' ? '(default)' : ''}`).join('\n');
      const pptxThemesFormatted = VALID_PPTX_THEMES.map(t => `• ${t} ${t === 'modern_minimal' ? '(default)' : ''}`).join('\n');

      return `*Available Themes*
----------------------------------------
*PDF Themes (5):*
${pdfThemesFormatted}

*PowerPoint Themes (10):*
${pptxThemesFormatted}
----------------------------------------
*Usage Example:*
/pdf Quantum Computing --theme=retro_pixel
/ppt Product Launch --theme=tech_indigo`;
    }

    if (cmd === '/usage') {
      const quota = db.checkUserQuota(senderJid, isOwnerUser);
      return `*Daily Quota Status*
----------------------------------------
• *User* : ${senderNum}
• *Role* : ${quota.role}
• *Used Today* : ${quota.isUnlimited ? 'Unlimited' : `${quota.used} / ${quota.limit}`}
• *Remaining* : ${quota.isUnlimited ? 'Unlimited' : `${quota.remaining} generations`}
• *Reset In* : ${quota.isUnlimited ? 'N/A' : `~${quota.resetInHours} hours (00:00 UTC)`}
----------------------------------------`;
    }

    // ==========================================
    // OWNER / ADMIN ONLY COMMANDS
    // ==========================================
    if (!isOwnerUser) {
      if (cmd === '/vip' || cmd === '/unvip' || cmd === '/vips' || cmd === '/status' || cmd === '/provider') {
        return `*Access Denied*\n----------------------------------------\nThis command is restricted to the bot owner.\nType /help for public commands.\n----------------------------------------`;
      }
      return null;
    }

    // --- Provider Inspection & Switching ---
    if (cmd === '/provider') {
      const sub = (args[0] || '').toLowerCase().trim();
      if (sub === 'groq' || sub === 'nvidia') {
        aiProvider.setProvider(sub);
        return `*AI Provider Switched*\n----------------------------------------\n• Active Provider: *${sub.toUpperCase()}*\n• Status: Active\n----------------------------------------`;
      }

      const st = aiProvider.getStatus();
      const groqKeysActive = st.groqKeys.filter(k => k.status === 'ACTIVE').length;
      const nvidiaKeysActive = st.nvidiaKeys.filter(k => k.status === 'ACTIVE').length;

      return `*AI Provider Engine*
----------------------------------------
• *Active Provider* : *${st.activeProvider}*
• *Groq Keys* : ${groqKeysActive}/${st.totalGroqKeys} active (${st.groqPrimaryModel})
• *NVIDIA Keys* : ${nvidiaKeysActive}/${st.totalNvidiaKeys} active (${st.nvidiaPrimaryModel})
----------------------------------------
*Switch Provider:*
• \`/provider groq\` - Multi-key distributed parallel engine
• \`/provider nvidia\` - High-token NVIDIA NIM engine`;
    }

    const extractTarget = () => {
      if (args && args.length > 0) {
        const cleaned = (args[0] || '').replace(/[^0-9]/g, '');
        if (cleaned.length >= 6) return cleaned;
      }
      if (rawMsg) {
        const mentions = permissionChecker.extractMentions(rawMsg);
        if (mentions && mentions.length > 0) {
          const cleaned = mentions[0].split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
          if (cleaned) return cleaned;
        }
        const quoted = permissionChecker.extractQuotedSender(rawMsg);
        if (quoted) {
          const cleaned = quoted.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
          if (cleaned) return cleaned;
        }
      }
      return null;
    };

    // --- VIP Grant ---
    if (cmd === '/vip') {
      const target = extractTarget();
      if (!target) {
        return `*Grant VIP*\n----------------------------------------\n• Usage: /vip <phone_number or lid>\n• Or: Reply to any message with /vip\n----------------------------------------`;
      }
      db.setVip(target, true);
      return `*VIP Granted*\n----------------------------------------\n• User: ${target}\n• Role: VIP User\n• Quota: Unlimited\n• Status: Active\n----------------------------------------`;
    }

    // --- VIP Revoke ---
    if (cmd === '/unvip') {
      const target = extractTarget();
      if (!target) {
        return `*Revoke VIP*\n----------------------------------------\n• Usage: /unvip <phone_number or lid>\n• Or: Reply to any message with /unvip\n----------------------------------------`;
      }
      db.setVip(target, false);
      return `*VIP Revoked*\n----------------------------------------\n• User: ${target}\n• Role: Standard User\n• Quota: Standard (10/day)\n• Status: Updated\n----------------------------------------`;
    }

    // --- List VIPs ---
    if (cmd === '/vips') {
      const vips = db.getVips();
      const list = vips.length > 0
        ? vips.map((v, i) => `• ${i + 1}. *${v}* (Unlimited)`).join('\n')
        : 'No VIP users registered.';

      return `*VIP Whitelist*
----------------------------------------
${list}
----------------------------------------
• Use /vip <phone/lid> or reply /vip to add
• Use /unvip <phone/lid> or reply /unvip to remove`;
    }

    // --- Status ---
    if (cmd === '/status') {
      const analytics = db.getAnalytics();
      const aiStatus = aiProvider.getStatus();
      const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);

      return `*System Status*
----------------------------------------
*Metrics:*
• State: ONLINE
• Uptime: ${this.formatUptime()}
• RAM: ${mem} MB
• Active Groq Keys: ${aiStatus.totalGroqKeys}
• Active NVIDIA Keys: ${aiStatus.totalNvidiaKeys}

*Today:*
• Generations: ${analytics.totalGenerationsToday || 0}
• Active Users: ${analytics.activeUsersToday || 0}
• VIP Users: ${analytics.vipCount || 0}
• Avg Speed: ${analytics.avgLatencyMs ? `${(analytics.avgLatencyMs / 1000).toFixed(1)}s` : 'N/A'}

*All-Time:*
• PDFs: ${analytics.totalPdfsGenerated || 0}
• PPTs: ${analytics.totalPptsGenerated || 0}
• Total: ${analytics.totalArtifactsGenerated || 0}
----------------------------------------`;
    }

    return null;
  }
};
