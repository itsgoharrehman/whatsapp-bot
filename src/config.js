import fs from 'fs';
import path from 'path';

try {
  const dotenv = await import('dotenv');
  dotenv.default.config();
} catch (err) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.substring(0, idx).trim();
          const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  }
}

const ROOT_DIR = process.cwd();

export const config = {
  port: parseInt(process.env.PORT || '8100', 10),
  host: process.env.HOST || process.env.IP || '0.0.0.0',
  ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER.trim().replace(/[^0-9]/g, '') : '',
  dashboardSecret: process.env.DASHBOARD_SECRET || '',

  // Rate Limits & Quotas
  dailyUserLimit: parseInt(process.env.DAILY_USER_LIMIT || '10', 10),
  normalUserMaxPages: parseInt(process.env.NORMAL_USER_MAX_PAGES || '4', 10),
  normalUserMaxSlides: parseInt(process.env.NORMAL_USER_MAX_SLIDES || '10', 10),
  ownerMaxPages: 12,
  ownerMaxSlides: 25,
  antiSpamCooldownMs: 30000,

  // Groq API Keys & Models (Parallel Multi-Key Engine)
  groqKeys: (process.env.GROQ_API_KEYS || '').split(',').map(k => k.trim()).filter(k => k.length > 0),
  groqArtifactPrimary: process.env.GROQ_MODEL_PDF || process.env.GROQ_ARTIFACT_PRIMARY || 'openai/gpt-oss-120b',
  groqArtifactFallbacks: (process.env.GROQ_PDF_FALLBACK_MODELS || process.env.GROQ_ARTIFACT_FALLBACKS || 'openai/gpt-oss-20b,qwen/qwen3.6-27b,llama-3.3-70b-versatile')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),

  // NVIDIA API Keys & Models (NVIDIA NIM)
  nvidiaKeys: (process.env.NVIDIA_API_KEYS || '').split(',').map(k => k.trim()).filter(k => k.length > 0),
  nvidiaArtifactPrimary: process.env.NVIDIA_MODEL_PDF || process.env.NVIDIA_ARTIFACT_PRIMARY || 'nvidia/nemotron-3-super-120b-a12b',
  nvidiaArtifactFallbacks: (process.env.NVIDIA_PDF_FALLBACK_MODELS || process.env.NVIDIA_ARTIFACT_FALLBACKS || 'openai/gpt-oss-120b,minimaxai/minimax-m3,nvidia/nemotron-3-ultra-550b-a55b,nvidia/nemotron-3-nano-30b-a3b')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),

  defaultProvider: (process.env.DEFAULT_PROVIDER || 'groq').toLowerCase(),

  // Generation Parameters
  artifactMaxTokens: 3500,
  artifactTemperature: 0.2,

  antiBanMinDelayMs: parseInt(process.env.ANTI_BAN_MIN_DELAY_MS || '2000', 10),
  antiBanMaxDelayMs: parseInt(process.env.ANTI_BAN_MAX_DELAY_MS || '4000', 10),
  sessionDir: path.resolve(ROOT_DIR, process.env.SESSION_DIR || './auth_info_baileys'),
  dbFilePath: path.resolve(ROOT_DIR, process.env.DB_FILE_PATH || './db.json')
};
