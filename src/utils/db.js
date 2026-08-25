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
      identities: {},
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
          identities: parsed.identities || {},
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
    } catch (err) {}
  }

  normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return '';
    let num = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    // Normalize Pakistani mobile format (03xx... -> 923xx...)
    if (num.startsWith('03') && num.length === 11) {
      num = '92' + num.slice(1);
    }
    return num;
  }

  registerIdentity(phoneOrJid, lidOrJid) {
    if (!phoneOrJid || !lidOrJid) return;
    const phone = this.normalizeJid(phoneOrJid);
    const lid = this.normalizeJid(lidOrJid);
    if (!phone || !lid || phone === lid) return;

    if (!this.data.identities) this.data.identities = {};
    let changed = false;
    if (this.data.identities[lid] !== phone) {
      this.data.identities[lid] = phone;
      changed = true;
    }
    if (this.data.identities[phone] !== lid) {
      this.data.identities[phone] = lid;
      changed = true;
    }

    // If one is VIP, link the other automatically
    if (this.isVip(phone) && !this.data.vips.includes(lid)) {
      this.data.vips.push(lid);
      changed = true;
    } else if (this.isVip(lid) && !this.data.vips.includes(phone)) {
      this.data.vips.push(phone);
      changed = true;
    }

    if (changed) {
      this.save();
    }
  }

  getAssociatedIdentities(jidOrPhone) {
    const raw = this.normalizeJid(jidOrPhone);
    const results = new Set([raw]);
    if (!this.data.identities) return Array.from(results);

    const mapped = this.data.identities[raw];
    if (mapped) results.add(mapped);
    return Array.from(results);
  }

  resolveDisplayPhone(jidOrPhone) {
    const raw = this.normalizeJid(jidOrPhone);
    if (this.data.identities && this.data.identities[raw]) {
      const mapped = this.data.identities[raw];
      if (raw.length >= 14 && mapped.length <= 13) return mapped;
    }
    return raw;
  }

  isVip(jidOrPhone) {
    if (!jidOrPhone) return false;
    const candidates = this.getAssociatedIdentities(jidOrPhone);

    return candidates.some(candidate => {
      const num = this.normalizeJid(candidate);
      if (!num) return false;
      return this.data.vips.some(v => {
        const normV = this.normalizeJid(v);
        if (normV === num || v === num) return true;
        if (num.length >= 9 && normV.length >= 9 && num.length <= 13 && normV.length <= 13) {
          return num.slice(-9) === normV.slice(-9);
        }
        return false;
      });
    });
  }

  setVip(jidOrPhone, isVip = true) {
    const num = this.normalizeJid(jidOrPhone);
    if (!num) return false;

    const candidates = this.getAssociatedIdentities(num);

    if (isVip) {
      candidates.forEach(c => {
        if (!this.data.vips.includes(c)) {
          this.data.vips.push(c);
        }
      });
    } else {
      this.data.vips = this.data.vips.filter(v => {
        const normV = this.normalizeJid(v);
        return !candidates.some(c => {
          const normC = this.normalizeJid(c);
          if (normV === normC || v === normC) return true;
          if (normC.length >= 9 && normV.length >= 9 && normC.length <= 13 && normV.length <= 13) {
            return normC.slice(-9) === normV.slice(-9);
          }
          return false;
        });
      });
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
    const displayPhone = this.resolveDisplayPhone(userJid);
    const isVipUser = this.isVip(userJid) || this.isVip(displayPhone);

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
        role: 'VIP User',
        allowed: true,
        isUnlimited: true,
        remaining: Infinity,
        limit: Infinity,
        used: 0,
        resetInHours: 0
      };
    }

    const today = getTodayString();
    let record = this.data.quotas[displayPhone] || this.data.quotas[this.normalizeJid(userJid)];

    if (!record || record.date !== today) {
      record = {
        date: today,
        total: 0,
        pdfCount: 0,
        pptCount: 0,
        lastUsed: 0
      };
      this.data.quotas[displayPhone] = record;
    }

    const limit = config.dailyUserLimit || 10;
    const used = record.total || 0;
    const remaining = Math.max(0, limit - used);
    const allowed = used < limit;

    return {
      role: 'Standard User',
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

    const displayPhone = this.resolveDisplayPhone(userJid);
    const today = getTodayString();
    this.checkGlobalDateRollover();

    // Update user quota
    if (!this.data.quotas[displayPhone] || this.data.quotas[displayPhone].date !== today) {
      this.data.quotas[displayPhone] = { date: today, total: 0, pdfCount: 0, pptCount: 0, lastUsed: 0 };
    }
    const userRecord = this.data.quotas[displayPhone];
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

    this.data.recentGenerations.unshift({
      id: `gen_${Date.now()}`,
      type,
      title,
      pagesOrSlides,
      latencyMs,
      modelUsed,
      userPhone: displayPhone ? `${displayPhone.slice(0, 4)}***${displayPhone.slice(-3)}` : 'Unknown',
      isOwner: Boolean(isOwner),
      timestamp: new Date().toISOString()
    });

    if (this.data.recentGenerations.length > 50) {
      this.data.recentGenerations = this.data.recentGenerations.slice(0, 50);
    }

    this.save();
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
