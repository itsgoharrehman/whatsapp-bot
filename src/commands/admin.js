import { config } from '../config.js';
import { db } from '../utils/db.js';
import { aiProvider } from '../ai/provider.js';

export default {
  isOwner(senderJid, isFromMe = false, botContext = {}) {
    if (isFromMe) return true;
    if (!senderJid) return false;
    const senderNumber = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (config.ownerNumber && senderNumber === config.ownerNumber.replace(/[^0-9]/g, '')) return true;
    if (botContext.botJid && senderNumber === botContext.botJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '')) return true;
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

  async handleCommand(commandText, senderJid, isFromMe = false, botContext = {}) {
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
    const senderNum = senderJid.split('@')[0].split(':')[0];

    // ==========================================
    // PUBLIC USER COMMANDS
    // ==========================================
    if (cmd === '/help') {
      return `*Artifact Generation Engine* › *Help*
────────────────────
*Document Generation:*
• */pdf* <topic> ── Generate a formatted multi-page PDF document
• */ppt* <topic> ── Generate an executive PowerPoint (.pptx) deck

*Quota & Balance:*
• */usage* (or */limit*) ── Check your remaining daily generations

*Pro Tips:*
• You can reply/quote any message and type */pdf* or */ppt* to convert it into a document!
• Standard users receive up to 10 generations per day (max 4 pages per PDF / 10 slides per PPT).
────────────────────`;
    }

    if (cmd === '/usage' || cmd === '/limit') {
      const quota = db.checkUserQuota(senderJid, isOwnerUser);
      return `*Artifact Engine* › *Daily Quota*
────────────────────
• *User* : ${senderNum}
• *Status* : ${quota.isUnlimited ? '🌟 VIP / Owner (Unlimited)' : 'Standard User'}
• *Used Today* : ${quota.isUnlimited ? 'N/A' : `${quota.used} / ${quota.limit}`}
• *Remaining* : ${quota.isUnlimited ? '∞ Unlimited' : `${quota.remaining} generations`}
• *Reset In* : ${quota.isUnlimited ? 'N/A' : `~${quota.resetInHours} hours (00:00 UTC)`}
────────────────────
*Quick Commands:*
• \`/pdf <topic>\`
• \`/ppt <topic>\``;
    }

    // ==========================================
    // OWNER / ADMIN ONLY COMMANDS
    // ==========================================
    if (!isOwnerUser) {
      return `*Artifact Engine* › *Access Denied*\n────────────────────\n• *Status* : Unauthorized\n• *Detail* : Owner verification required\n• Type */help* for user commands\n────────────────────`;
    }

    if (cmd === '/status') {
      const analytics = db.getAnalytics();
      const aiStatus = aiProvider.getStatus();
      const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);

      return `*Artifact Engine* › *System Status*
────────────────────
*SYSTEM METRICS*
• *State* : ONLINE
• *Uptime* : ${this.formatUptime()}
• *RAM Usage* : ${mem} MB
• *Active Groq Keys* : ${aiStatus.totalGroqKeys} keys
• *Active NVIDIA Keys* : ${aiStatus.totalNvidiaKeys} keys

*TODAY'S PRODUCTION*
• *Generations Today* : ${analytics.totalGenerationsToday || 0}
• *Active Users Today* : ${analytics.activeUsersToday || 0}
• *Avg Generation Speed* : ${analytics.avgLatencyMs ? `${(analytics.avgLatencyMs / 1000).toFixed(1)}s` : 'N/A'}

*TOTAL PRODUCTION (ALL-TIME)*
• *PDF Documents* : ${analytics.totalPdfsGenerated || 0}
• *PowerPoint Decks* : ${analytics.totalPptsGenerated || 0}
• *Total Artifacts* : ${analytics.totalArtifactsGenerated || 0}
────────────────────`;
    }

    if (cmd === '/stats') {
      const analytics = db.getAnalytics();
      const topUsers = db.getTopUsers(5);

      const topUsersFormatted = topUsers.length > 0
        ? topUsers.map((u, i) => `• ${i + 1}. *${u.phone}*: ${u.total} gens (${u.pdfCount} PDFs, ${u.pptCount} PPTs)`).join('\n')
        : '_No generations recorded today yet._';

      return `*Artifact Engine* › *Production Analytics*
────────────────────
*ALL-TIME COUNTERS*
• *Total Artifacts* : ${analytics.totalArtifactsGenerated || 0}
• *Total PDFs* : ${analytics.totalPdfsGenerated || 0}
• *Total PPTs* : ${analytics.totalPptsGenerated || 0}
• *Average Latency* : ${analytics.avgLatencyMs ? `${(analytics.avgLatencyMs / 1000).toFixed(1)}s` : 'N/A'}

*TOP ACTIVE USERS TODAY*
${topUsersFormatted}
────────────────────`;
    }

    if (cmd === '/keys') {
      const aiStatus = aiProvider.getStatus();
      const keysFormatted = aiStatus.keys.map(k => `• Key #${k.index} (${k.masked}): *${k.status}* [✓ ${k.successes} | ✗ ${k.errors}]`).join('\n');

      return `*Artifact Engine* › *Multi-Key Health Matrix*
────────────────────
*GROQ POOL (${aiStatus.totalGroqKeys} KEYS)*
${keysFormatted}

*NVIDIA POOL*
• Configured Keys: ${aiStatus.totalNvidiaKeys}
────────────────────`;
    }

    if (cmd === '/unlimit' || cmd === '/vip') {
      const targetPhone = (args[0] || '').replace(/[^0-9]/g, '');
      if (!targetPhone) {
        return `*Artifact Engine* › *VIP Management*\n────────────────────\n• *Usage* : /unlimit <phone_number>\n• *Example* : /unlimit 923001234567\n────────────────────`;
      }
      db.setVip(targetPhone, true);
      return `*Artifact Engine* › *VIP Granted*\n────────────────────\n• *User* : ${targetPhone}\n• *Quota* : UNLIMITED (∞)\n• *Status* : Active\n────────────────────`;
    }

    if (cmd === '/limit' && args.length > 0) {
      const targetPhone = (args[0] || '').replace(/[^0-9]/g, '');
      db.setVip(targetPhone, false);
      return `*Artifact Engine* › *VIP Revoked*\n────────────────────\n• *User* : ${targetPhone}\n• *Quota* : Standard (10/day)\n────────────────────`;
    }

    if (cmd === '/reset') {
      const target = (args[0] || '').toLowerCase();
      if (target === 'all') {
        db.resetAllQuotas();
        return `*Artifact Engine* › *Quotas Reset*\n────────────────────\n• *Status* : All daily user limits have been reset to 0/10.\n────────────────────`;
      }
      const targetPhone = target.replace(/[^0-9]/g, '');
      if (targetPhone) {
        db.resetUserQuota(targetPhone);
        return `*Artifact Engine* › *User Quota Reset*\n────────────────────\n• *User* : ${targetPhone}\n• *Status* : Reset to 0/10 for today.\n────────────────────`;
      }
      return `*Artifact Engine* › *Reset Command*\n────────────────────\n• /reset all ── Reset everyone's daily quota\n• /reset <phone_number> ── Reset specific user\n────────────────────`;
    }

    return `*Artifact Engine* › *Unknown Command*\n────────────────────\n• *Command* : ${cmd}\n• Type */help* for user commands\n• Type */status* for admin overview\n────────────────────`;
  }
};
