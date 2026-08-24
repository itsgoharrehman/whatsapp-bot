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
    const senderNum = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

    // ==========================================
    // PUBLIC USER COMMANDS
    // ==========================================
    if (cmd === '/help') {
      return `*Artifact Generation Engine* › *Help*
────────────────────
*Document Generation:*
• */pdf* <topic> ── Generate a formatted PDF document
• */ppt* <topic> ── Generate an executive PowerPoint (.pptx) deck

*Quota & Status:*
• */usage* ── Check your remaining daily generations balance

*Admin Management (Owner):*
• */vip* <phone> ── Grant unlimited generations to a VIP user
• */unvip* <phone> ── Revoke VIP status (or */limit <phone>*)
• */vips* ── List all active VIP users
• */status* ── View system uptime & generation metrics
• */keys* ── Live multi-key health matrix

*Pro Tips:*
• Quote any message and type */pdf* or */ppt* to convert it!
• Standard users get 10 generations per day.
────────────────────`;
    }

    if (cmd === '/usage' || cmd === '/quota' || cmd === '/balance') {
      const quota = db.checkUserQuota(senderJid, isOwnerUser);
      return `*Artifact Engine* › *Daily Quota*
────────────────────
• *User* : ${senderNum}
• *Role* : ${quota.role}
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
      if (cmd === '/vip' || cmd === '/unvip' || cmd === '/unlimit' || cmd === '/limit' || cmd === '/status' || cmd === '/stats' || cmd === '/keys' || cmd === '/reset') {
        return `*Artifact Engine* › *Access Denied*\n────────────────────\n• *Status* : Unauthorized\n• *Detail* : This command is restricted to the bot owner.\n• Type */help* for public commands\n────────────────────`;
      }
      return null;
    }

    // --- VIP Grant Command ---
    if (cmd === '/vip' || cmd === '/unlimit') {
      const targetPhone = (args[0] || '').replace(/[^0-9]/g, '');
      if (!targetPhone) {
        return `*Artifact Engine* › *Grant VIP*\n────────────────────\n• *Usage* : /vip <phone_number>\n• *Example* : /vip 923238522260\n────────────────────`;
      }
      db.setVip(targetPhone, true);
      return `*Artifact Engine* › *VIP Granted*\n────────────────────\n• *User* : ${targetPhone}\n• *Role* : 🌟 VIP User\n• *Quota* : Unlimited (∞)\n• *Status* : Active\n────────────────────`;
    }

    // --- VIP Revoke Command ---
    if (cmd === '/unvip' || (cmd === '/limit' && args.length > 0)) {
      const targetPhone = (args[0] || '').replace(/[^0-9]/g, '');
      if (!targetPhone) {
        return `*Artifact Engine* › *Revoke VIP*\n────────────────────\n• *Usage* : /unvip <phone_number>\n• *Example* : /unvip 923238522260\n────────────────────`;
      }
      db.setVip(targetPhone, false);
      return `*Artifact Engine* › *VIP Revoked*\n────────────────────\n• *User* : ${targetPhone}\n• *Role* : Standard User\n• *Quota* : Standard (10/day)\n• *Status* : Updated\n────────────────────`;
    }

    // --- List VIPs ---
    if (cmd === '/vips') {
      const vips = db.getVips();
      const list = vips.length > 0
        ? vips.map((v, i) => `• ${i + 1}. *${v}* (Unlimited)`).join('\n')
        : '_No VIP users currently registered._';

      return `*Artifact Engine* › *VIP Whitelist*
────────────────────
${list}
────────────────────
• Use */vip <phone>* to add a user
• Use */unvip <phone>* to remove a user`;
    }

    if (cmd === '/limit' && args.length === 0) {
      return `*Artifact Engine* › *Limit Command*
────────────────────
• */usage* ── Check your own balance
• */vip <phone>* ── Grant unlimited VIP access
• */unvip <phone>* (or */limit <phone>*) ── Revoke VIP access
────────────────────`;
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
• *VIP Users* : ${analytics.vipCount || 0}
• *Avg Speed* : ${analytics.avgLatencyMs ? `${(analytics.avgLatencyMs / 1000).toFixed(1)}s` : 'N/A'}

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
