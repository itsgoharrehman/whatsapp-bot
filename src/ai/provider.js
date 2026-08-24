import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { db } from '../utils/db.js';

let GroqSDK = null;
try {
  const mod = await import('groq-sdk');
  GroqSDK = mod.default?.default || mod.default || mod.Groq || mod;
} catch (err) {
  logger.error(`[CRITICAL] Error importing groq-sdk: ${err.message}`);
}

class AIProviderManager {
  constructor() {
    this.groqKeys = config.groqKeys;
    this.groqClients = new Map();
    this.nvidiaKeys = config.nvidiaKeys;
    this.keyHealth = new Map(); // key -> { errors: 0, lastError: 0, successes: 0 }
  }

  maskKey(key) {
    if (!key || key.length < 8) return '[NO KEY]';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  }

  getGroqClient(apiKey) {
    if (!this.groqClients.has(apiKey)) {
      if (GroqSDK) {
        this.groqClients.set(apiKey, new GroqSDK({ apiKey }));
      }
    }
    return this.groqClients.get(apiKey);
  }

  recordKeySuccess(key) {
    const stat = this.keyHealth.get(key) || { errors: 0, lastError: 0, successes: 0 };
    stat.successes += 1;
    stat.errors = Math.max(0, stat.errors - 1);
    this.keyHealth.set(key, stat);
  }

  recordKeyError(key, errorMsg) {
    const stat = this.keyHealth.get(key) || { errors: 0, lastError: 0, successes: 0 };
    stat.errors += 1;
    stat.lastError = Date.now();
    this.keyHealth.set(key, stat);
    logger.warn(`Key error [${this.maskKey(key)}]: ${errorMsg}`);
  }

  isKeyCoolingDown(key) {
    const stat = this.keyHealth.get(key);
    if (!stat || stat.errors === 0) return false;
    // 15-second cooldown if recent error
    return Date.now() - stat.lastError < 15000 && stat.errors >= 2;
  }

  /**
   * Selects up to `count` healthy Groq keys for parallel execution.
   */
  selectGroqKeys(count = 3) {
    if (!this.groqKeys || this.groqKeys.length === 0) return [];
    
    // Sort by health (fewer recent errors) and shuffle lightly
    const available = [...this.groqKeys]
      .filter(k => !this.isKeyCoolingDown(k))
      .sort(() => 0.5 - Math.random());

    if (available.length >= count) {
      return available.slice(0, count);
    }
    // If cooling down too many, take any from the full list
    return [...this.groqKeys].sort(() => 0.5 - Math.random()).slice(0, Math.min(count, this.groqKeys.length));
  }

  /**
   * Executes a single Groq completion with strict JSON response.
   */
  async fetchGroqSingle(apiKey, model, messages, maxTokens = 3500) {
    const client = this.getGroqClient(apiKey);
    if (client) {
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: config.artifactTemperature || 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      });
      return completion.choices?.[0]?.message?.content || '';
    }

    // Direct HTTP fetch fallback for Groq
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: config.artifactTemperature || 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Executes a single NVIDIA completion with strict JSON response.
   */
  async fetchNvidiaSingle(apiKey, model, messages, maxTokens = 3500) {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: config.artifactTemperature || 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`NVIDIA HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  cleanJsonString(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let cleaned = rawText.trim();
    // Remove markdown code fences if model enclosed in ```json ... ```
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.slice(startIdx, endIdx + 1);
    }
    return cleaned;
  }

  /**
   * MULTI-KEY PARALLEL ARTIFACT ENGINE:
   * Dispatches concurrent requests across multiple Groq keys and NVIDIA models.
   * Uses Promise.any to return the first validated JSON response.
   */
  async executeParallelArtifactRequest({ messages, type = 'pdf', maxTokens = 3500 }) {
    const startTime = Date.now();
    const groqKeysToUse = this.selectGroqKeys(3);
    const modelsToTry = [
      config.groqArtifactPrimary,
      ...config.groqArtifactFallbacks
    ];

    const tasks = [];

    // 1. Queue Groq parallel workers across distinct keys
    groqKeysToUse.forEach((apiKey, index) => {
      const model = modelsToTry[index % modelsToTry.length];
      const task = (async () => {
        try {
          const raw = await this.fetchGroqSingle(apiKey, model, messages, maxTokens);
          const cleaned = this.cleanJsonString(raw);
          const parsed = JSON.parse(cleaned);

          // Validate artifact structure
          if (type === 'pdf' && (!Array.isArray(parsed.sections) || parsed.sections.length === 0)) {
            throw new Error('PDF output missing sections array');
          }
          if (type === 'pptx' && (!Array.isArray(parsed.slides) || parsed.slides.length === 0)) {
            throw new Error('PPTX output missing slides array');
          }

          this.recordKeySuccess(apiKey);
          return {
            json: parsed,
            rawText: raw,
            provider: 'groq',
            modelUsed: model,
            keyUsed: this.maskKey(apiKey),
            latencyMs: Date.now() - startTime
          };
        } catch (err) {
          this.recordKeyError(apiKey, `${model}: ${err.message}`);
          throw err;
        }
      })();
      tasks.push(task);
    });

    // 2. Queue NVIDIA worker if keys available
    if (this.nvidiaKeys && this.nvidiaKeys.length > 0) {
      const nvidiaKey = this.nvidiaKeys[Math.floor(Math.random() * this.nvidiaKeys.length)];
      const nvidiaModel = config.nvidiaArtifactPrimary;
      const nvidiaTask = (async () => {
        try {
          const raw = await this.fetchNvidiaSingle(nvidiaKey, nvidiaModel, messages, maxTokens);
          const cleaned = this.cleanJsonString(raw);
          const parsed = JSON.parse(cleaned);

          if (type === 'pdf' && (!Array.isArray(parsed.sections) || parsed.sections.length === 0)) {
            throw new Error('PDF output missing sections array');
          }
          if (type === 'pptx' && (!Array.isArray(parsed.slides) || parsed.slides.length === 0)) {
            throw new Error('PPTX output missing slides array');
          }

          this.recordKeySuccess(nvidiaKey);
          return {
            json: parsed,
            rawText: raw,
            provider: 'nvidia',
            modelUsed: nvidiaModel,
            keyUsed: this.maskKey(nvidiaKey),
            latencyMs: Date.now() - startTime
          };
        } catch (err) {
          this.recordKeyError(nvidiaKey, `${nvidiaModel}: ${err.message}`);
          throw err;
        }
      })();
      tasks.push(nvidiaTask);
    }

    // 3. Race all parallel workers with Promise.any
    try {
      const winner = await Promise.any(tasks);
      logger.info(`[PARALLEL:SUCCESS] Provider: ${winner.provider.toUpperCase()} | Model: ${winner.modelUsed} | Key: ${winner.keyUsed} | Speed: ${winner.latencyMs}ms`);
      return winner;
    } catch (aggregateErr) {
      logger.warn('[PARALLEL:FAILOVER] Parallel fast path exhausted. Starting sequential fallback...');
      
      // Fallback: Try remaining keys sequentially
      for (const model of modelsToTry) {
        for (const key of this.groqKeys) {
          try {
            const raw = await this.fetchGroqSingle(key, model, messages, maxTokens);
            const cleaned = this.cleanJsonString(raw);
            const parsed = JSON.parse(cleaned);
            return {
              json: parsed,
              rawText: raw,
              provider: 'groq',
              modelUsed: model,
              keyUsed: this.maskKey(key),
              latencyMs: Date.now() - startTime
            };
          } catch (err) {
            continue;
          }
        }
      }

      throw new Error(`Artifact generation failed across all keys and models: ${aggregateErr.message}`);
    }
  }

  getStatus() {
    const keysReport = this.groqKeys.map((k, i) => {
      const h = this.keyHealth.get(k) || { errors: 0, successes: 0 };
      return {
        index: i + 1,
        masked: this.maskKey(k),
        status: this.isKeyCoolingDown(k) ? 'COOLDOWN' : 'ACTIVE',
        successes: h.successes,
        errors: h.errors
      };
    });

    return {
      totalGroqKeys: this.groqKeys.length,
      totalNvidiaKeys: this.nvidiaKeys.length,
      groqPrimaryModel: config.groqArtifactPrimary,
      groqFallbackModels: config.groqArtifactFallbacks,
      nvidiaPrimaryModel: config.nvidiaArtifactPrimary,
      nvidiaFallbackModels: config.nvidiaArtifactFallbacks,
      keys: keysReport
    };
  }
}

export const aiProvider = new AIProviderManager();
export { AIProviderManager };
