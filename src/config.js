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

  // Groq API Keys & Models
  groqKeys: (process.env.GROQ_API_KEYS || '').split(',').map(k => k.trim()).filter(k => k.length > 0),
  groqRouterModel: process.env.GROQ_ROUTER_MODEL || process.env.ROUTER_MODEL || 'allam-2-7b',
  routerModel: process.env.GROQ_ROUTER_MODEL || process.env.ROUTER_MODEL || 'allam-2-7b',
  groqRouterFallbackModels: (process.env.GROQ_ROUTER_FALLBACK_MODELS || 'openai/gpt-oss-20b,qwen/qwen3.6-27b,openai/gpt-oss-120b')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  groqModelSimple: process.env.GROQ_MODEL_SIMPLE || 'qwen/qwen3.6-27b',
  groqSimpleFallbackModels: (process.env.GROQ_SIMPLE_FALLBACK_MODELS || 'openai/gpt-oss-20b,openai/gpt-oss-120b,allam-2-7b')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  groqModelReasoning: process.env.GROQ_MODEL_REASONING || 'openai/gpt-oss-120b',
  groqReasoningFallbackModels: (process.env.GROQ_REASONING_FALLBACK_MODELS || 'openai/gpt-oss-20b')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  groqModelPdf: process.env.GROQ_MODEL_PDF || 'openai/gpt-oss-120b',
  groqPdfFallbackModels: (process.env.GROQ_PDF_FALLBACK_MODELS || 'openai/gpt-oss-20b,qwen/qwen3.6-27b')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  groqModelPptx: process.env.GROQ_MODEL_PPTX || 'openai/gpt-oss-120b',
  groqPptxFallbackModels: (process.env.GROQ_PPTX_FALLBACK_MODELS || 'openai/gpt-oss-20b,qwen/qwen3.6-27b')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  groqModelMultimodal: process.env.GROQ_MODEL_MULTIMODAL || 'qwen/qwen3.6-27b',
  groqMultimodalFallbackModels: (process.env.GROQ_MULTIMODAL_FALLBACK_MODELS || '')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  groqModelAudio: process.env.GROQ_MODEL_AUDIO || 'whisper-large-v3-turbo',
  groqAudioFallbackModels: (process.env.GROQ_AUDIO_FALLBACK_MODELS || 'whisper-large-v3')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),

  dashboardSecret: process.env.DASHBOARD_SECRET || '',

  // NVIDIA API Keys & Models (NVIDIA NIM)
  nvidiaKeys: (process.env.NVIDIA_API_KEYS || '').split(',').map(k => k.trim()).filter(k => k.length > 0),
  nvidiaRouterModel: process.env.NVIDIA_ROUTER_MODEL || 'nvidia/nemotron-3-nano-30b-a3b',
  nvidiaRouterFallbackModels: (process.env.NVIDIA_ROUTER_FALLBACK_MODELS || 'openai/gpt-oss-20b,minimaxai/minimax-m3,meta/llama-3.1-8b-instruct')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  nvidiaModelSimple: process.env.NVIDIA_MODEL_SIMPLE || 'nvidia/nemotron-3-nano-30b-a3b',
  nvidiaSimpleFallbackModels: (process.env.NVIDIA_SIMPLE_FALLBACK_MODELS || 'openai/gpt-oss-120b,minimaxai/minimax-m3,meta/llama-3.1-8b-instruct,nvidia/llama-3.1-nemotron-nano-vl-8b-v1')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  nvidiaModelReasoning: process.env.NVIDIA_MODEL_REASONING || 'nvidia/nemotron-3-ultra-550b-a55b',
  nvidiaReasoningFallbackModels: (process.env.NVIDIA_REASONING_FALLBACK_MODELS || 'openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b,z-ai/glm-5.2,minimaxai/minimax-m3')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  nvidiaModelPdf: process.env.NVIDIA_MODEL_PDF || 'nvidia/nemotron-3-ultra-550b-a55b',
  nvidiaPdfFallbackModels: (process.env.NVIDIA_PDF_FALLBACK_MODELS || 'openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b,z-ai/glm-5.2,minimaxai/minimax-m3')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  nvidiaModelPptx: process.env.NVIDIA_MODEL_PPTX || 'nvidia/nemotron-3-ultra-550b-a55b',
  nvidiaPptxFallbackModels: (process.env.NVIDIA_PPTX_FALLBACK_MODELS || 'openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b,z-ai/glm-5.2,minimaxai/minimax-m3')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  nvidiaModelMultimodal: process.env.NVIDIA_MODEL_MULTIMODAL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  nvidiaMultimodalFallbackModels: (process.env.NVIDIA_MULTIMODAL_FALLBACK_MODELS || 'minimaxai/minimax-m3,nvidia/nemotron-nano-12b-v2-vl,nvidia/llama-3.1-nemotron-nano-vl-8b-v1,nvidia/nemotron-3-nano-30b-a3b')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),
  nvidiaModelAudio: process.env.NVIDIA_MODEL_AUDIO || 'nvidia/nemotron-asr-streaming',
  nvidiaAudioFallbackModels: (process.env.NVIDIA_AUDIO_FALLBACK_MODELS || 'nvidia/nemotron-voicechat')
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0),

  // Token limits & generation parameters
  routerMaxTokens: 256,
  routerTemperature: 0.1,
  simpleMaxTokens: 1024,
  reasoningMaxTokens: 2048,
  generationTemperature: 0.7,
  routerConfidenceThreshold: 0.80,

  defaultProvider: (process.env.DEFAULT_PROVIDER || 'nvidia').toLowerCase(),

  antiBanMinDelayMs: parseInt(process.env.ANTI_BAN_MIN_DELAY_MS || '1500', 10),
  antiBanMaxDelayMs: parseInt(process.env.ANTI_BAN_MAX_DELAY_MS || '3000', 10),
  rateLimitMaxPerMinute: parseInt(process.env.RATE_LIMIT_MAX_PER_MINUTE || '15', 10),
  autoReplyEnabled: process.env.AUTO_REPLY_ENABLED === 'false' ? false : true,
  sessionDir: path.resolve(ROOT_DIR, process.env.SESSION_DIR || './auth_info_baileys'),
  dbFilePath: path.resolve(ROOT_DIR, process.env.DB_FILE_PATH || './db.json'),
  systemPromptPath: path.resolve(ROOT_DIR, process.env.SYSTEM_PROMPT_PATH || './system.md')
};

export function getSystemPrompt() {
  try {
    return fs.readFileSync(config.systemPromptPath, 'utf8');
  } catch (err) {
    return "You are Mark Zuckerberg, Gohar's Personal AI Assistant.";
  }
}
