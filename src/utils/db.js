import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from './logger.js';

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function getHoursUntilMidnightUtc() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return Math.max(1, Math.round((midnight.getTime() - now.getTime()) / (1000 * 60 * 60)));
}

class ArtifactDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {
      quotas: {},
      vips: [],
      analytics: {
        totalArtifactsGenerated: 0,
        totalPdfsGenerated: 0,
        totalPptsGenerated: 0,
        totalGenerationsToday: 0,
        todayDate: getTodayString(),
        avgLatencyMs: 0,
        keyUsageStats: {}
      },
      recentGenerations: []
    };
    this.init();
  }

  init() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          quotas: parsed.quotas || {},
          vips: Array.isArray(parsed.vips) ? parsed.vips : [],
          analytics: {
            totalArtifactsGenerated: parsed.analytics?.totalArtifactsGenerated || 0,
            totalPdfsGenerated: parsed.analytics?.totalPdfsGenerated || 0,
            totalPptsGenerated: parsed.analytics?.totalPptsGenerated || 0,
            totalGenerationsToday: parsed.analytics?.totalGenerationsToday || 0,
            todayDate: parsed.analytics?.todayDate || getTodayString(),
            avgLatencyMs: parsed.analytics?.avgLatencyMs || 0,
            keyUsageStats: parsed.analytics?.keyUsageStats || {}
          },
          recentGenerations: Array.isArray(parsed.recentGenerations) ? parsed.recentGenerations : []
        };
        this.checkGlobalDateRollover();
      } else {
        this.save();
      }
    } catch (err) {
      logger.error('Database load error, initialized fresh structure:', err.message);
      this.save();
    }
  }

  checkGlobalDateRollover() {
    const today = getTodayString();
    if (this.data.analytics.todayDate !== today) {
      this.data.analytics.todayDate = today;
      this.data.analytics.totalGenerationsToday = 0;
      this.save();
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

  normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return '';
    return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  }

  isVip(jidOrPhone) {
    if (!jidOrPhone) return false;
    const num = this.normalizeJid(jidOrPhone);
    if (!num) return false;
    // Check direct normalized number match or partial matches
    return this.data.vips.some(v => v === num || num.endsWith(v) || v.endsWith(num));
  }

  setVip(jidOrPhone, isVip = true) {
    const num = this.normalizeJid(jidOrPhone);
    if (!num) return false;
    if (isVip && !this.data.vips.includes(num)) {
      this.data.vips.push(num);
    } else if (!isVip) {
      this.data.vips = this.data.vips.filter(v => v !== num && !num.endsWith(v) && !v.endsWith(num));
    }
    this.save();
    return true;
  }

  getVips() {
    return [...this.data.vips];
  }

  /**
   * Checks daily generation quota and exact role for a user.
   */
  checkUserQuota(userJid, isOwner = false) {
    const userPhone = this.normalizeJid(userJid);
    const isVipUser = this.isVip(userPhone) || this.isVip(userJid);

    if (isOwner) {
      return {
        role: 'OWNER',
        allowed: true,
        isUnlimited: true,
        remaining: Infinity,
        limit: Infinity,
        used: 0,
        resetInHours: 0
      };
    }

    if (isVipUser) {
      return {
        role: 'VIP',
        allowed: true,
        isUnlimited: true,
        remaining: Infinity,
        limit: Infinity,
        used: 0,
        resetInHours: 0
      };
    }

    const today = getTodayString();
    let record = this.data.quotas[userPhone];

    if (!record || record.date !== today) {
      record = {
        date: today,
        total: 0,
        pdfCount: 0,
        pptCount: 0,
        lastUsed: 0
      };
      this.data.quotas[userPhone] = record;
    }

    const limit = config.dailyUserLimit || 10;
    const used = record.total || 0;
    const remaining = Math.max(0, limit - used);
    const allowed = used < limit;

    return {
      role: 'STANDARD',
      allowed,
      isUnlimited: false,
      remaining,
      limit,
      used,
      resetInHours: getHoursUntilMidnightUtc()
    };
  }

  /**
   * Records a successful artifact generation event.
   */
  recordGeneration(userJid, isOwner, metadata = {}) {
    const {
      type = 'pdf',
      title = 'Untitled',
      pagesOrSlides = 1,
      latencyMs = 0,
      modelUsed = '',
      keyUsed = ''
    } = metadata;

    const userPhone = this.normalizeJid(userJid);
    const today = getTodayString();
    this.checkGlobalDateRollover();

    // Update user quota
    if (!this.data.quotas[userPhone] || this.data.quotas[userPhone].date !== today) {
      this.data.quotas[userPhone] = { date: today, total: 0, pdfCount: 0, pptCount: 0, lastUsed: 0 };
    }
    const userRecord = this.data.quotas[userPhone];
    userRecord.total = (userRecord.total || 0) + 1;
    if (type === 'pdf') {
      userRecord.pdfCount = (userRecord.pdfCount || 0) + 1;
    } else {
      userRecord.pptCount = (userRecord.pptCount || 0) + 1;
    }
    userRecord.lastUsed = Date.now();

    // Update global analytics
    const a = this.data.analytics;
    a.totalArtifactsGenerated = (a.totalArtifactsGenerated || 0) + 1;
    a.totalGenerationsToday = (a.totalGenerationsToday || 0) + 1;
    if (type === 'pdf') {
      a.totalPdfsGenerated = (a.totalPdfsGenerated || 0) + 1;
    } else {
      a.totalPptsGenerated = (a.totalPptsGenerated || 0) + 1;
    }

    // Update rolling average latency
    if (latencyMs > 0) {
      if (a.avgLatencyMs === 0) {
        a.avgLatencyMs = latencyMs;
      } else {
        a.avgLatencyMs = Math.round((a.avgLatencyMs * 0.8) + (latencyMs * 0.2));
      }
    }

    // Update key stats
    if (keyUsed) {
      a.keyUsageStats[keyUsed] = (a.keyUsageStats[keyUsed] || 0) + 1;
    }

    // Add to recent activity log
    this.data.recentGenerations.unshift({
      id: `gen_${Date.now()}`,
      type,
      title,
      pagesOrSlides,
      latencyMs,
      modelUsed,
      userPhone: userPhone ? `${userPhone.slice(0, 4)}***${userPhone.slice(-3)}` : 'Unknown',
      isOwner: Boolean(isOwner),
      timestamp: new Date().toISOString()
    });

    if (this.data.recentGenerations.length > 50) {
      this.data.recentGenerations = this.data.recentGenerations.slice(0, 50);
    }

    this.save();
  }

  resetUserQuota(jidOrPhone) {
    const userPhone = this.normalizeJid(jidOrPhone);
    if (this.data.quotas[userPhone]) {
      delete this.data.quotas[userPhone];
      this.save();
      return true;
    }
    return false;
  }

  resetAllQuotas() {
    this.data.quotas = {};
    this.save();
    return true;
  }

  getAnalytics() {
    this.checkGlobalDateRollover();
    return {
      ...this.data.analytics,
      vipCount: this.data.vips.length,
      vips: this.data.vips,
      activeUsersToday: Object.keys(this.data.quotas).filter(k => this.data.quotas[k].date === getTodayString()).length,
      recentGenerations: this.data.recentGenerations.slice(0, 10)
    };
  }

  getTopUsers(limit = 10) {
    const today = getTodayString();
    return Object.entries(this.data.quotas)
      .filter(([_, q]) => q.date === today)
      .map(([phone, q]) => ({
        phone,
        total: q.total || 0,
        pdfCount: q.pdfCount || 0,
        pptCount: q.pptCount || 0
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }
}

export const db = new ArtifactDatabase(config.dbFilePath);
