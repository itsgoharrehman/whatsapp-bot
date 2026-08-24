import { config, getSystemPrompt } from '../config.js';
import { logger } from '../utils/logger.js';
import { db } from '../utils/db.js';

let GroqSDK = null;
try {
  const mod = await import('groq-sdk');
  GroqSDK = mod.default;
} catch (err) {}

class AIProviderManager {
  constructor() {
    this.groqKeys = config.groqKeys;
    this.groqKeyIndex = 0;
    this.groqClients = new Map();

    this.nvidiaKeys = config.nvidiaKeys;
    this.nvidiaKeyIndex = 0;
  }

  maskKey(key) {
    if (!key || key.length < 8) return '[NO KEY CONFIGURABLE]';
    return `${key.slice(0, 7)}...${key.slice(-4)}`;
  }

  getActiveProvider() {
    return db.getProvider();
  }

  setProvider(provider) {
    return db.setProvider(provider);
  }

  rotateKey(specifiedProvider = null, failedIndex = null) {
    const targetProvider = (specifiedProvider || this.getActiveProvider()).toLowerCase();

    if (targetProvider === 'nvidia') {
      if (this.nvidiaKeys.length <= 1) {
        return { rotated: false, provider: 'nvidia', index: this.nvidiaKeyIndex, total: this.nvidiaKeys.length, key: this.maskKey(this.nvidiaKeys[0]) };
      }
      if (failedIndex !== null && this.nvidiaKeyIndex !== failedIndex) {
        // Key was already rotated by another concurrent request
        return { rotated: false, provider: 'nvidia', index: this.nvidiaKeyIndex, total: this.nvidiaKeys.length, key: this.maskKey(this.nvidiaKeys[this.nvidiaKeyIndex]) };
      }
      const prev = this.nvidiaKeyIndex;
      this.nvidiaKeyIndex = (this.nvidiaKeyIndex + 1) % this.nvidiaKeys.length;
      db.incrementMetric('keyRotationsCount');
      logger.warn(`NVIDIA Key Rotation: Switched from key #${prev} to #${this.nvidiaKeyIndex}`);
      return { rotated: true, provider: 'nvidia', index: this.nvidiaKeyIndex, total: this.nvidiaKeys.length, key: this.maskKey(this.nvidiaKeys[this.nvidiaKeyIndex]) };
    }

    // Default to Groq key rotation
    if (this.groqKeys.length <= 1) {
      return { rotated: false, provider: 'groq', index: this.groqKeyIndex, total: this.groqKeys.length, key: this.maskKey(this.groqKeys[0]) };
    }
    if (failedIndex !== null && this.groqKeyIndex !== failedIndex) {
      // Key was already rotated by another concurrent request
      return { rotated: false, provider: 'groq', index: this.groqKeyIndex, total: this.groqKeys.length, key: this.maskKey(this.groqKeys[this.groqKeyIndex]) };
    }
    const prev = this.groqKeyIndex;
    this.groqKeyIndex = (this.groqKeyIndex + 1) % this.groqKeys.length;
    db.incrementMetric('keyRotationsCount');
    logger.warn(`Groq Key Rotation: Switched from key #${prev} to #${this.groqKeyIndex}`);
    return { rotated: true, provider: 'groq', index: this.groqKeyIndex, total: this.groqKeys.length, key: this.maskKey(this.groqKeys[this.groqKeyIndex]) };
  }

  /**
   * Semantic LLM Router using GPT-OSS 120B with fallback to GPT-OSS 20B.
   * Returns strict JSON: { route: 'simple' | 'reasoning' | 'multimodal', confidence: number }
   */
  async routePrompt(prompt, history = [], provider = null, metadata = {}) {
    if (metadata.isMedia || (metadata.mediaType && metadata.mediaType !== 'text')) {
      return { route: 'multimodal', confidence: 1.0, routerModel: 'media-detector' };
    }

    if (!prompt || typeof prompt !== 'string') {
      return { route: 'simple', confidence: 1.0, routerModel: config.routerModel };
    }

    // Fast-path: strip quote headers, @mark, @number triggers and test for standard opening greetings
    const botPhoneNum = config.ownerNumber || '';
    let strippedPrompt = (prompt || '').trim()
      .replace(/^\[Replying to quoted message\]:\s*"[\s\S]*?"\s*\n?/i, '')
      .replace(/^(@mark\s+zuckerberg|@mark|@zuck|mark\s+zuckerberg|mark)\s*[:,\-]?\s*/i, '')
      .replace(new RegExp(`^@${botPhoneNum}\\s*[:,\\-]?\\s*`, 'i'), '')
      .replace(/\s*(@mark\s+zuckerberg|@mark|@zuck)$/i, '')
      .trim();

    const cleanLower = (strippedPrompt || prompt).trim().toLowerCase();
    if (!cleanLower || /^(salam|assalam|assalamu\s+alaikum|aoa|hi|hello|hey|hola|kya haal|kia haal|kaise ho|kese ho|how are you|how are u|how r u|who are you|help|thanks|thank you|shukriya|good morning|good evening|good night)$/i.test(cleanLower)) {
      logger.info(`[ROUTE] Method: fast-path | Route: SIMPLE | Confidence: 1.00`);
      return { route: 'simple', confidence: 1.0, routerModel: 'fast-path' };
    }

    // Build minimal context (last 1-2 messages) for ambiguity resolution
    const recentContext = [];
    if (Array.isArray(history) && history.length > 0) {
      const slice = history.slice(-2);
      for (const m of slice) {
        if (m && m.content) {
          recentContext.push(`${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content.slice(0, 150)}`);
        }
      }
    }

    const routerSystemPrompt = `You are a semantic classification router for a WhatsApp AI assistant.
Analyze the user's incoming message and classify its required capability into exactly one route:
- "simple": greetings, ordinary chit-chat, short answers, basic facts, simple translations, ordinary WhatsApp inquiries, straightforward questions not requiring multi-step logical derivation or code debugging.
- "reasoning": complex coding tasks, hard bug fixing, system architecture, advanced mathematics, intricate logic, comparisons with trade-offs, tasks requiring multi-step inference.

Output MUST be a single strict JSON object:
{"route": "simple" | "reasoning", "confidence": 0.0 to 1.0}
Do NOT output any markdown blocks, thoughts, or explanations.`;

    const routerMessages = [
      { role: 'system', content: routerSystemPrompt },
      ...(recentContext.length > 0 ? [{ role: 'user', content: `Recent context:\n${recentContext.join('\n')}\n\nUser message: ${prompt}` }] : [{ role: 'user', content: prompt }])
    ];

    const activeProvider = (provider || this.getActiveProvider()).toLowerCase();
    const providersToTry = activeProvider === 'nvidia' ? ['nvidia', 'groq'] : ['groq', 'nvidia'];

    for (const p of providersToTry) {
      const candidateRouters = p === 'nvidia'
        ? [config.nvidiaRouterModel, ...(config.nvidiaRouterFallbackModels || []).filter(m => m !== config.nvidiaRouterModel)]
        : [config.routerModel, ...(config.groqRouterFallbackModels || []).filter(m => m !== config.routerModel)];

      const keys = p === 'nvidia' ? this.nvidiaKeys : this.groqKeys;
      if (!keys || keys.length === 0) continue;

      for (const routerModel of candidateRouters) {
        let attempts = 0;
        const maxAttempts = Math.max(keys.length, 1);

        while (attempts < maxAttempts) {
          try {
            let routerRaw = '';
            if (p === 'nvidia') {
              const apiKey = this.nvidiaKeys[this.nvidiaKeyIndex];
              const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                signal: AbortSignal.timeout(4000),
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                  messages: routerMessages,
                  model: routerModel,
                  temperature: config.routerTemperature,
                  max_tokens: config.routerMaxTokens,
                  response_format: { type: 'json_object' }
                })
              });
              if (res.ok) {
                const data = await res.json();
                routerRaw = data.choices?.[0]?.message?.content?.trim() || '';
              } else {
                throw new Error(`NVIDIA Router HTTP ${res.status}`);
              }
            } else {
              const apiKey = this.groqKeys[this.groqKeyIndex];
              const routerBody = {
                messages: routerMessages,
                model: routerModel,
                temperature: config.routerTemperature,
                max_tokens: config.routerMaxTokens
              };

              const isQwen = routerModel.includes('qwen');
              const isGptOss = routerModel.includes('gpt-oss');

              if (isQwen) {
                routerBody.reasoning_effort = 'none';
                routerBody.reasoning_format = 'hidden';
              } else if (isGptOss) {
                routerBody.reasoning_format = 'hidden';
              }

              if (isGptOss || isQwen || routerModel.includes('llama')) {
                routerBody.response_format = { type: 'json_object' };
              }

              const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                signal: AbortSignal.timeout(6000),
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(routerBody)
              });
              if (res.ok) {
                const data = await res.json();
                routerRaw = data.choices?.[0]?.message?.content?.trim() || '';
              } else {
                const errText = await res.text().catch(() => '');
                throw new Error(`Groq Router HTTP ${res.status}${errText ? `: ${errText.substring(0, 80)}` : ''}`);
              }
            }

            if (routerRaw) {
              try {
                const parsed = JSON.parse(routerRaw);
                const rawRoute = String(parsed.route || '').toLowerCase();
                const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.9;
                const route = rawRoute === 'reasoning' ? 'reasoning' : 'simple';

                if (confidence < config.routerConfidenceThreshold) {
                  logger.info(`[ROUTE] Method: ${routerModel} (${p.toUpperCase()}) | Route: REASONING (Threshold Fallback < 0.80) | Confidence: ${confidence.toFixed(2)}`);
                  return { route: 'reasoning', confidence, routerModel, fallbackThreshold: true };
                }
                logger.info(`[ROUTE] Method: ${routerModel} (${p.toUpperCase()}) | Route: ${route.toUpperCase()} | Confidence: ${confidence.toFixed(2)}`);
                return { route, confidence, routerModel };
              } catch (jsonErr) {
                const routeMatch = routerRaw.match(/"route"\s*:\s*"(simple|reasoning)"/i);
                if (routeMatch) {
                  const route = routeMatch[1].toLowerCase();
                  logger.info(`[ROUTE] Method: ${routerModel} (${p.toUpperCase()}) | Route: ${route.toUpperCase()} | Confidence: 0.85`);
                  return { route, confidence: 0.85, routerModel };
                }
              }
            }
          } catch (err) {
            attempts++;
            this.rotateKey(p, p === 'nvidia' ? this.nvidiaKeyIndex : this.groqKeyIndex);
            logger.warn(`[ROUTER] Router model '${routerModel}' on ${p} failed: ${err.message}. Trying next key/model.`);
          }
        }
      }
    }

    // Safe router heuristic fallback without crashing
    return this.applyHeuristicRoute(prompt);
  }

  applyHeuristicRoute(prompt) {
    const isLongOrComplex = (prompt && prompt.length > 200) || /[{}[\]();=><]{3,}|```/i.test(prompt || '');
    return {
      route: isLongOrComplex ? 'reasoning' : 'simple',
      confidence: 0.80,
      routerModel: 'fallback-heuristic'
    };
  }

  /**
   * Selects model and isolated fallback pool based on semantic route & provider architecture.
   */
  selectModel(route, provider = null) {
    const activeProvider = (provider || this.getActiveProvider()).toLowerCase();

    if (activeProvider === 'nvidia') {
      if (route === 'pptx' || route === 'ppt') {
        return {
          model: config.nvidiaModelPptx || 'nvidia/nemotron-3-super-120b-a12b',
          fallbackModels: config.nvidiaPptxFallbackModels || ['openai/gpt-oss-120b', 'nvidia/nemotron-3-ultra-550b-a55b', 'minimaxai/minimax-m3', 'z-ai/glm-5.2'],
          isMultimodal: false,
          isReasoning: true,
          maxTokens: 4096,
          reasoningEffort: 'medium',
          reasoningFormat: 'hidden'
        };
      }

      if (route === 'pdf') {
        return {
          model: config.nvidiaModelPdf || config.nvidiaModelReasoning,
          fallbackModels: config.nvidiaPdfFallbackModels || config.nvidiaReasoningFallbackModels,
          isMultimodal: false,
          isReasoning: true,
          maxTokens: config.reasoningMaxTokens,
          reasoningEffort: 'medium',
          reasoningFormat: 'hidden'
        };
      }

      if (route === 'audio') {
        return {
          model: config.nvidiaModelAudio || 'nvidia/nemotron-asr-streaming',
          fallbackModels: config.nvidiaAudioFallbackModels || ['nvidia/nemotron-voicechat'],
          isMultimodal: true,
          isAudio: true,
          isReasoning: false,
          maxTokens: config.simpleMaxTokens,
          reasoningEffort: 'none',
          reasoningFormat: 'hidden'
        };
      }

      if (route === 'multimodal') {
        return {
          model: config.nvidiaModelMultimodal,
          fallbackModels: config.nvidiaMultimodalFallbackModels,
          isMultimodal: true,
          isReasoning: false,
          maxTokens: config.reasoningMaxTokens,
          reasoningEffort: 'none',
          reasoningFormat: 'hidden'
        };
      }

      if (route === 'reasoning') {
        return {
          model: config.nvidiaModelReasoning,
          fallbackModels: config.nvidiaReasoningFallbackModels,
          isMultimodal: false,
          isReasoning: true,
          maxTokens: config.reasoningMaxTokens,
          reasoningEffort: 'medium',
          reasoningFormat: 'hidden'
        };
      }

      // Default: simple / normal chat (Nemotron-3 Nano 30B)
      return {
        model: config.nvidiaModelSimple,
        fallbackModels: config.nvidiaSimpleFallbackModels,
        isMultimodal: false,
        isReasoning: false,
        maxTokens: config.simpleMaxTokens,
        reasoningEffort: 'none',
        reasoningFormat: 'hidden'
      };
    }

    // Groq Provider Routing Architecture
    if (route === 'pptx' || route === 'ppt') {
      return {
        model: config.groqModelPptx || 'openai/gpt-oss-120b',
        fallbackModels: config.groqPptxFallbackModels || ['openai/gpt-oss-20b', 'qwen/qwen3.6-27b'],
        isMultimodal: false,
        isReasoning: true,
        maxTokens: 4096,
        reasoningEffort: 'medium',
        reasoningFormat: 'hidden'
      };
    }

    if (route === 'pdf') {
      return {
        model: config.groqModelPdf || config.groqModelReasoning,
        fallbackModels: config.groqPdfFallbackModels || config.groqReasoningFallbackModels,
        isMultimodal: false,
        isReasoning: true,
        maxTokens: config.reasoningMaxTokens,
        reasoningEffort: 'medium',
        reasoningFormat: 'hidden'
      };
    }

    if (route === 'audio') {
      return {
        model: config.groqModelAudio || 'whisper-large-v3-turbo',
        fallbackModels: config.groqAudioFallbackModels || ['whisper-large-v3'],
        isMultimodal: true,
        isAudio: true,
        isReasoning: false,
        maxTokens: config.simpleMaxTokens,
        reasoningEffort: 'none',
        reasoningFormat: 'hidden'
      };
    }

    if (route === 'multimodal' || route === 'image') {
      return {
        model: config.groqModelMultimodal || 'qwen/qwen3.6-27b',
        fallbackModels: config.groqMultimodalFallbackModels || [],
        isMultimodal: true,
        isReasoning: false,
        maxTokens: config.reasoningMaxTokens,
        reasoningEffort: 'none',
        reasoningFormat: 'hidden'
      };
    }

    if (route === 'reasoning') {
      return {
        model: config.groqModelReasoning,
        fallbackModels: config.groqReasoningFallbackModels,
        isMultimodal: false,
        isReasoning: true,
        maxTokens: config.reasoningMaxTokens,
        reasoningEffort: 'medium',
        reasoningFormat: 'hidden'
      };
    }

    // Default: simple / normal chat (allam-2-7b -> qwen/qwen3.6-27b -> openai/gpt-oss-20b -> openai/gpt-oss-120b)
    return {
      model: config.groqModelSimple,
      fallbackModels: config.groqSimpleFallbackModels,
      isMultimodal: false,
      isReasoning: false,
      maxTokens: config.simpleMaxTokens,
      reasoningEffort: 'none',
      reasoningFormat: 'hidden'
    };
  }

  normalizeNvidiaModel(model) {
    if (!model || typeof model !== 'string') return model;
    const trimmed = model.trim();
    const lower = trimmed.toLowerCase();

    // Multimodal models
    if (lower.includes('11b-vision') || lower === 'llama-3.2-11b-vision' || lower === 'meta/llama-3.2-11b-vision-instruct') {
      return 'meta/llama-3.2-11b-vision-instruct';
    }
    if (lower.includes('90b-vision') || lower === 'meta/llama-3.2-90b-vision-instruct') {
      return 'meta/llama-3.2-90b-vision-instruct';
    }
    if (lower === 'nvidia/nemotron-3-nano-omni-30b' || lower === 'nemotron-3-nano-omni-30b' || lower === 'nemotron 3 nano omni 30b' || lower === 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning') {
      return 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
    }
    if (lower.includes('nemotron-nano-12b-v2-vl') || lower === 'nvidia/nemotron-nano-12b-v2-vl') {
      return 'nvidia/nemotron-nano-12b-v2-vl';
    }
    if (lower.includes('nemotron-nano-vl-8b') || lower.includes('llama-3.1-nemotron-nano-vl-8b-v1')) {
      return 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1';
    }

    // Audio & Speech models
    if (lower.includes('nemotron-asr-streaming') || lower === 'nvidia/nemotron-asr-streaming') {
      return 'nvidia/nemotron-asr-streaming';
    }
    if (lower.includes('nemotron-voicechat') || lower === 'nvidia/nemotron-voicechat') {
      return 'nvidia/nemotron-voicechat';
    }

    // Simple & fast models
    if (lower === 'nemotron-3-nano-30b-a3b' || lower === 'nvidia/nemotron-3-nano-30b-a3b') {
      return 'nvidia/nemotron-3-nano-30b-a3b';
    }
    if (lower.includes('3.5-lightning') || lower === 'nemotron-3.5-lightning-30b-a3b' || lower === 'nvidia/nemotron-3.5-lightning-30b-a3b') {
      return 'nvidia/nemotron-3.5-lightning-30b-a3b';
    }
    if (lower === 'llama-3.1-8b' || lower === 'llama-3.1-8b-instruct' || lower === 'meta/llama-3.1-8b-instruct') {
      return 'meta/llama-3.1-8b-instruct';
    }
    if (lower === 'minimax-m3' || lower === 'minimax m3' || lower === 'minimaxai/minimax-m3') {
      return 'minimaxai/minimax-m3';
    }

    // Reasoning models
    if (lower.includes('3-ultra-550b') || lower.includes('nemotron-3-ultra') || lower === 'nvidia/nemotron-3-ultra-550b-a55b') {
      return 'nvidia/nemotron-3-ultra-550b-a55b';
    }
    if (lower.includes('3-super-120b') || lower === 'nvidia/nemotron-3-super-120b-a12b') {
      return 'nvidia/nemotron-3-super-120b-a12b';
    }
    if (lower === 'llama-3.1-70b' || lower === 'llama-3.1-70b-instruct' || lower === 'meta/llama-3.1-70b-instruct') {
      return 'meta/llama-3.1-70b-instruct';
    }
    if (lower === 'glm-5.2' || lower === 'z-ai/glm-5.2') {
      return 'z-ai/glm-5.2';
    }

    // Router / General models
    if (lower === 'gpt-oss-120b' || lower === 'gpt-oss 120b' || lower === 'openai/gpt-oss-120b') {
      return 'openai/gpt-oss-120b';
    }
    if (lower === 'gpt-oss-20b' || lower === 'gpt-oss 20b' || lower === 'openai/gpt-oss-20b') {
      return 'openai/gpt-oss-20b';
    }

    return trimmed;
  }

  prepareMessages(history, currentPrompt, isReasoning = false, metadata = {}) {
    const baseSystemPrompt = getSystemPrompt();
    let conciseInstruction = isReasoning
      ? "\n\n[STRICT INSTRUCTION: Output ONLY the direct WhatsApp reply. Do not include internal thinking, persona analysis, or reasoning.]"
      : "\n\n[STRICT INSTRUCTION: Keep your response short, direct, clear, and natural WhatsApp style.]";

    if (metadata && metadata.isOwner) {
      conciseInstruction += "\n\n[USER CONTEXT: You are talking to Gohar Rehman (the verified Owner). Follow his instructions directly with sharp wit and loyalty.]";
    }

    let systemPrompt = `${baseSystemPrompt}${conciseInstruction}`;

    const memoryRules = db.getRules();
    if (memoryRules && memoryRules.length > 0) {
      systemPrompt += `\n\n<dynamic_owner_rules>\nThe Owner has provided the following custom live rules for you to follow:\n`;
      memoryRules.forEach((r, i) => {
        systemPrompt += `${i + 1}. ${r}\n`;
      });
      systemPrompt += `</dynamic_owner_rules>`;
    }

    const formattedMessages = [{ role: 'system', content: systemPrompt }];
    const maxBudget = 12000;
    let currentLength = systemPrompt.length + (currentPrompt ? currentPrompt.length : 0);

    const recentHistory = Array.isArray(history) ? [...history] : [];
    const includedHistory = [];

    for (let i = recentHistory.length - 1; i >= 0; i--) {
      const msg = recentHistory[i];
      if (!msg || !msg.content) continue;
      if (currentLength + msg.content.length > maxBudget) break;
      currentLength += msg.content.length;

      // Pure conversational messages without synthetic role prefixes
      includedHistory.unshift({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }

    formattedMessages.push(...includedHistory);

    // Multimodal payload handling (Clean without third-party tokens)
    if (metadata && metadata.mediaBase64 && metadata.mediaMimeType) {
      const mediaDataUrl = `data:${metadata.mediaMimeType};base64,${metadata.mediaBase64}`;
      const isAudio = Boolean(metadata.mediaType === 'audio' || metadata.mediaType === 'voice' || (metadata.mediaMimeType && metadata.mediaMimeType.startsWith('audio/')));
      const isVideo = Boolean(metadata.mediaType === 'video' || (metadata.mediaMimeType && metadata.mediaMimeType.startsWith('video/')));

      if (isAudio) {
        const transcriptText = metadata.transcript || (currentPrompt && !currentPrompt.startsWith('[') ? currentPrompt : 'Audio message received');
        formattedMessages.push({ role: 'user', content: transcriptText });
        return formattedMessages;
      }

      if (isVideo) {
        const queryText = (currentPrompt && currentPrompt.trim() && !currentPrompt.startsWith('['))
          ? currentPrompt.trim()
          : 'Please describe and summarize what you see in this visual scene.';
        formattedMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: queryText },
            { type: 'image_url', image_url: { url: mediaDataUrl } }
          ]
        });
        return formattedMessages;
      }

      // Standard image message
      const imgPrompt = (currentPrompt && currentPrompt.trim() && !currentPrompt.startsWith('['))
        ? currentPrompt.trim()
        : 'Please analyze this image and respond in a friendly, natural manner.';
      formattedMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: imgPrompt },
          { type: 'image_url', image_url: { url: mediaDataUrl } }
        ]
      });
    } else {
      formattedMessages.push({ role: 'user', content: currentPrompt || 'Hello' });
    }

    return formattedMessages;
  }

  async transcribeAudio(mediaBase64, mediaMimeType = 'audio/ogg') {
    if (!mediaBase64 || this.groqKeys.length === 0) return null;
    const audioBuffer = Buffer.from(mediaBase64, 'base64');
    if (audioBuffer.length < 500) return null;

    const whisperModels = [
      config.groqModelAudio || 'whisper-large-v3-turbo',
      ...(config.groqAudioFallbackModels || ['whisper-large-v3'])
    ];
    const ext = (mediaMimeType || '').includes('mp3') ? 'mp3' : ((mediaMimeType || '').includes('wav') ? 'wav' : 'ogg');

    for (const model of whisperModels) {
      let attempts = 0;
      const maxAttempts = Math.max(this.groqKeys.length, 1);

      while (attempts < maxAttempts) {
        try {
          const apiKey = this.groqKeys[this.groqKeyIndex];
          const formData = new FormData();
          const blob = new Blob([audioBuffer], { type: mediaMimeType || 'audio/ogg' });
          formData.append('file', blob, `voice_note.${ext}`);
          formData.append('model', model);
          formData.append('prompt', 'Pakistani Roman Urdu, Urdu, English conversational voice message');

          const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            signal: AbortSignal.timeout(8000),
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            const text = (data.text || '').trim();
            if (text) return text;
          } else {
            throw new Error(`Whisper HTTP ${res.status}`);
          }
        } catch (err) {
          attempts++;
          this.rotateKey('groq', this.groqKeyIndex);
          logger.warn(`Audio transcription model '${model}' attempt failed: ${err.message}. Rotating Groq key.`);
        }
      }
    }
    return null;
  }

  getGroqClient() {
    if (this.groqKeys.length === 0) return null;
    const currentKey = this.groqKeys[this.groqKeyIndex];
    if (GroqSDK) {
      if (!this.groqClients.has(currentKey)) {
        this.groqClients.set(currentKey, new GroqSDK({ apiKey: currentKey }));
      }
      return this.groqClients.get(currentKey);
    }
    return null;
  }

  async executeGroqRequest({ messages, primaryModel, fallbackModels = [], isReasoning, maxTokens, reasoningEffort, reasoningFormat, responseFormat }) {
    if (this.groqKeys.length === 0) throw new Error('No Groq API keys available.');
    const candidateModels = [primaryModel, ...(fallbackModels || []).filter(m => m !== primaryModel)];
    let lastError = null;

    for (const model of candidateModels) {
      let attempts = 0;
      const maxAttempts = Math.max(this.groqKeys.length, 1);

      while (attempts < maxAttempts) {
        try {
          const apiKey = this.groqKeys[this.groqKeyIndex];
          let content = '';
          const isQwen = model.includes('qwen');
          const isGptOss = model.includes('gpt-oss');

          // Build request payload
          const requestBody = {
            messages,
            model,
            temperature: config.generationTemperature,
            max_tokens: maxTokens
          };

          if (responseFormat) {
            requestBody.response_format = responseFormat;
          }

          if (isQwen && !isReasoning) {
            requestBody.reasoning_effort = 'none';
            requestBody.reasoning_format = 'hidden';
          } else if (isGptOss || isReasoning) {
            requestBody.reasoning_format = 'hidden';
          }

          if (GroqSDK) {
            const client = this.getGroqClient();
            if (client) {
              const completion = await client.chat.completions.create(requestBody);
              const choice = completion.choices?.[0];
              content = choice?.message?.content?.trim() || '';
            }
          }

          if (!content) {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify(requestBody)
            });
            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Groq HTTP ${res.status}: ${errText}`);
            }
            const data = await res.json();
            const choice = data.choices?.[0];
            content = choice?.message?.content?.trim() || '';
          }

          if (content) {
            return {
              content,
              actualModel: model,
              fallbackUsed: model !== primaryModel
            };
          }
        } catch (err) {
          lastError = err;
          attempts++;
          if (this.groqKeys.length > 1) this.rotateKey('groq', this.groqKeyIndex);
          logger.warn(`Groq Model '${model}' attempt ${attempts} failed: ${err.message}. Rotating key.`);
          await new Promise(res => setTimeout(res, 300));
        }
      }
    }
    throw lastError || new Error('All Groq candidate models in pool failed.');
  }

  async executeNvidiaRequest({ messages, primaryModel, fallbackModels = [], isReasoning, maxTokens, responseFormat }) {
    if (this.nvidiaKeys.length === 0) throw new Error('No NVIDIA API keys configured in NVIDIA_API_KEYS.');
    const rawCandidates = [primaryModel, ...(fallbackModels || []).filter(m => m !== primaryModel)];
    const candidateModels = rawCandidates.map(m => this.normalizeNvidiaModel(m));
    let lastError = null;

    for (const model of candidateModels) {
      let attempts = 0;
      const maxAttempts = Math.max(this.nvidiaKeys.length, 1);

      while (attempts < maxAttempts) {
        try {
          const apiKey = this.nvidiaKeys[this.nvidiaKeyIndex];
          const requestBody = {
            messages,
            model,
            temperature: config.generationTemperature,
            max_tokens: maxTokens
          };

          if (responseFormat) {
            requestBody.response_format = responseFormat;
          }

          const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(60000),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`NVIDIA HTTP ${res.status}: ${errText}`);
          }
          const data = await res.json();
          const choice = data.choices?.[0];
          const content = choice?.message?.content?.trim() || '';
          if (content) {
            return {
              content,
              actualModel: model,
              fallbackUsed: model !== this.normalizeNvidiaModel(primaryModel)
            };
          }
        } catch (err) {
          lastError = err;
          attempts++;
          if (this.nvidiaKeys.length > 1) this.rotateKey('nvidia', this.nvidiaKeyIndex);
          logger.warn(`NVIDIA Model '${model}' attempt ${attempts} failed: ${err.message}. Rotating key.`);
          await new Promise(res => setTimeout(res, 300));
        }
      }
    }
    throw lastError || new Error('All NVIDIA candidate models in pool failed.');
  }

  cleanResponse(text) {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // 1. If the model provided an explicit "Final Response" / "Message" marker anywhere, extract ONLY what comes after it
    const finalMarkerMatch = cleaned.match(/(?:^|\n)(?:#{1,4}\s*)?(?:\*\*)?(?:Final\s+(?:Response|Answer|Output|Message)|Conversational\s+Reply|Direct\s+Reply|Clean\s+Reply|Message|Final:)(?:\*\*)?:?\s*\n*([\s\S]*)$/i);
    if (finalMarkerMatch && finalMarkerMatch[1] && finalMarkerMatch[1].trim()) {
      cleaned = finalMarkerMatch[1];
    } else {
      // 2. Strip closed reasoning/thinking wrappers
      cleaned = cleaned.replace(/<(think|thought|reasoning|reflection|analysis|details|inner_monologue)>[\s\S]*?<\/\1>/gi, '');
      // 3. Strip unclosed reasoning tags
      cleaned = cleaned.replace(/<(think|thought|reasoning|reflection|analysis|details|inner_monologue)>[\s\S]*/gi, '');

      // 4. Strip Chain of Thought & Persona/Architecture Analysis dumps (e.g. "Let's see: The user is...", "Role & Ambition: ...", "Goals: ...")
      cleaned = cleaned.replace(/(?:^|\n)(?:Here's\s+a\s+thinking\s+process:?|Thinking\s+Process:?|Thought\s+Process:?|Internal\s+Reasoning:?|Reasoning\s+Steps:?)[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/gi, '');
      cleaned = cleaned.replace(/(?:^|\n)(?:#{1,4}\s*)?(?:\*\*)?(?:Role\s*(?:&|and)\s*Ambition|User\s*Profile|Persona(?:\s*Analysis)?|Goals|Current\s*Actions|Architecture\s*Insight|System\s*Architecture|Technical\s*Stack|User\s*Intent)(?:\*\*)?:?[\s\S]*?(?=\n\n[A-Z0-9]|\n\n[a-z]|$)/gi, '');
      cleaned = cleaned.replace(/(?:^|\n)(?:#{1,4}\s*)?(?:\*\*)?(?:Draft\s+Response|Refined?\s*(?:Response)?|Self-Correction|Final\s+Check)(?:\*\*)?:?[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/gi, '');
      
      // Strip numbered internal steps (e.g. "1. *Analyze...", "2. *Determine...")
      cleaned = cleaned.replace(/(?:^|\n)\d+\.\s*\*(?:Analyze|Check|Determine|Self-Correction|Refine|Draft|Verify|Review)[\s\S]*?(?=\n\n|\n\d+\.\s*\*|$)/gi, '');
      
      // Strip "Let's see...", "Let's analyze...", "Okay, the user...", "The user is..." analysis preambles
      cleaned = cleaned.replace(/^(?:Let's\s+(?:see|analyze|check|think|break\s+down)|Analyzing\s+(?:the\s+)?(?:user|prompt|input)|Analysis):?[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/gim, '');
      cleaned = cleaned.replace(/^(?:Okay|Alright|Sure|Now|So),?\s+(?:the user|the prompt|I should|I need to|let's|looking at|we have|we need to)[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/gim, '');
      cleaned = cleaned.replace(/^(?:The user is|The user wants|I will|Step \d+:|As an AI representing|As a language model)[\s\S]*?(?=\n\n[A-Za-z0-9]|$)/gim, '');
    }

    // 5. Strip any residual closed/unclosed tags
    cleaned = cleaned.replace(/<(think|thought|reasoning|reflection|analysis|details|inner_monologue)>[\s\S]*?<\/\1>/gi, '');
    cleaned = cleaned.replace(/<(think|thought|reasoning|reflection|analysis|details|inner_monologue)>[\s\S]*/gi, '');

    // 6. Strip residual internal verification markers, meta role lines, or robotic prefixes
    cleaned = cleaned.replace(/^(?:Matches rules\??\s*(?:Yes|No|True|False)|Decision Check:?\s*(?:Passed|OK|Yes|No)|Silently verify:?.*)$/gim, '');
    cleaned = cleaned.replace(/^(?:Role|Persona|Identity|Model|Status|Mode):\s*.*$/gim, '');
    cleaned = cleaned.replace(/^(?:Proceeds\.|Proceeding\.|Done\.|Ready\.|Finished\.|Success\.|Passed\.)$/gim, '');
    cleaned = cleaned.replace(/^(?:Response|Mark|Output|Assistant):\s*/i, '');
    cleaned = cleaned.replace(/^As a third-party user,?\s*/i, '');
    cleaned = cleaned.replace(/^For third-party users,?\s*/i, '');
    cleaned = cleaned.trim();

    // 7. If response looks like purely residual meta reasoning with no valid conversation, reject it
    if (/^(?:Done\.|Output matches\.|Proceeds\.|Ready\.|\(Self-Correction.*\)|\(Refinement.*\)|\*?\*?(?:Role|Goals|Architecture|System|User|Let's|Analyzing|I should)\b.*)\s*$/im.test(cleaned)) {
      return '';
    }
    if (/^(?:[-*•]\s+.*(?:\n|$))+$/m.test(cleaned) && (cleaned.includes('architecture') || cleaned.includes('pipeline') || cleaned.includes('engineering') || cleaned.includes('system'))) {
      return '';
    }

    return cleaned.trim();
  }

  getMediaRejectionMessage(mediaType = 'media') {
    const t = (mediaType || '').toLowerCase();
    if (t === 'image' || t.startsWith('image/')) {
      return "I'm currently unable to process image messages.";
    }
    if (t === 'audio' || t === 'voice' || t.startsWith('audio/')) {
      return "I'm currently unable to process voice messages.";
    }
    if (t === 'video' || t.startsWith('video/')) {
      return "I'm currently unable to process video messages.";
    }
    if (t === 'document' || t.startsWith('application/')) {
      return "I'm currently unable to process document files.";
    }
    return "I'm currently unable to process media messages.";
  }

  async generateResponse(prompt, history = [], metadata = {}) {
    const startTime = Date.now();
    const provider = this.getActiveProvider();
    const isImage = Boolean(metadata.mediaType === 'image' || (metadata.mediaMimeType && metadata.mediaMimeType.startsWith('image/')));
    const isAudio = Boolean(metadata.mediaType === 'audio' || metadata.mediaType === 'voice' || (metadata.mediaMimeType && metadata.mediaMimeType.startsWith('audio/')));
    const isVideo = Boolean(metadata.mediaType === 'video' || (metadata.mediaMimeType && metadata.mediaMimeType.startsWith('video/')));
    let isMedia = isImage || isAudio || isVideo || Boolean(metadata.isMedia);

    // Video Handling: NOT PROCESSED -> Return video canned response
    if (isVideo) {
      logger.info('Received video message: Returning configured text-only rejection.');
      return this.getMediaRejectionMessage('video');
    }

    // For Audio / Voice Notes: Transcribe voice note via Whisper, then route text to chat models
    if (isAudio) {
      if (metadata.mediaBase64) {
        try {
          const transcript = await this.transcribeAudio(metadata.mediaBase64, metadata.mediaMimeType);
          if (transcript) {
            metadata.transcript = transcript;
            prompt = transcript;
            metadata.isMedia = false;
            isMedia = false;
            metadata.mediaType = 'text';
            logger.info(`Voice note transcribed successfully: "${transcript.substring(0, 80)}" -> Routing to Chat Model`);
          } else {
            return "I received your voice message, but couldn't transcribe the audio clearly. Please send your message in text!";
          }
        } catch (tErr) {
          return "I received your voice message, but couldn't transcribe the audio clearly. Please send your message in text!";
        }
      } else if (metadata.transcript) {
        prompt = metadata.transcript;
        metadata.isMedia = false;
        isMedia = false;
        metadata.mediaType = 'text';
      } else {
        return this.getMediaRejectionMessage('audio');
      }
    }

    // 1. Semantic Router Step (with multi-key rotation and cross-provider failover)
    const routeResult = await this.routePrompt(prompt, history, provider, metadata);

    // For Images: Process via NVIDIA Vision Models (or fallback) if media buffer is present
    if (isImage) {
      if (metadata.mediaBase64 && this.nvidiaKeys.length > 0) {
        try {
          const nvidiaSelect = this.selectModel('multimodal', 'nvidia');
          const messages = this.prepareMessages(history, prompt, false, metadata);
          const executionResult = await this.executeNvidiaRequest({
            messages,
            primaryModel: nvidiaSelect.model,
            fallbackModels: nvidiaSelect.fallbackModels,
            isReasoning: false,
            maxTokens: nvidiaSelect.maxTokens
          });
          const cleaned = this.cleanResponse(executionResult.content);
          return cleaned || "Nice picture!";
        } catch (vErr) {
          logger.warn(`Vision model processing failed: ${vErr.message}`);
        }
      }
      return this.getMediaRejectionMessage('image');
    }

    // Chat Message Execution: Strict Primary -> Fallbacks -> Key Rotation -> Alternate Provider Failover
    const primaryProvider = (provider === 'auto') ? (this.groqKeys.length > 0 ? 'groq' : 'nvidia') : provider;
    const secondaryProvider = primaryProvider === 'nvidia' ? 'groq' : 'nvidia';

    let executionResult = null;
    let finalProviderUsed = primaryProvider;
    let requestMessages = null;

    const primarySelect = this.selectModel(routeResult.route, primaryProvider);
    logger.info(`[SELECTION] Route: ${routeResult.route.toUpperCase()} | Provider: ${primaryProvider.toUpperCase()} | Primary: ${primarySelect.model} | Fallbacks: ${primarySelect.fallbackModels?.join(', ') || 'none'}`);

    // Try Primary Provider
    try {
      requestMessages = this.prepareMessages(history, prompt, primarySelect.isReasoning, metadata);

      if (primaryProvider === 'nvidia') {
        executionResult = await this.executeNvidiaRequest({
          messages: requestMessages,
          primaryModel: primarySelect.model,
          fallbackModels: primarySelect.fallbackModels,
          isReasoning: primarySelect.isReasoning,
          maxTokens: primarySelect.maxTokens
        });
      } else {
        executionResult = await this.executeGroqRequest({
          messages: requestMessages,
          primaryModel: primarySelect.model,
          fallbackModels: primarySelect.fallbackModels,
          isReasoning: primarySelect.isReasoning,
          maxTokens: primarySelect.maxTokens,
          reasoningEffort: primarySelect.reasoningEffort,
          reasoningFormat: primarySelect.reasoningFormat
        });
      }
    } catch (primaryErr) {
      logger.warn(`[FAILOVER] ${primaryProvider.toUpperCase()} primary provider exhausted (${primaryErr.message}). Attempting failover to ${secondaryProvider.toUpperCase()}...`);
      finalProviderUsed = secondaryProvider;

      const secondarySelect = this.selectModel(routeResult.route, secondaryProvider);
      logger.info(`[SELECTION] Route: ${routeResult.route.toUpperCase()} | Provider: ${secondaryProvider.toUpperCase()} | Primary: ${secondarySelect.model} | Fallbacks: ${secondarySelect.fallbackModels?.join(', ') || 'none'}`);
      requestMessages = this.prepareMessages(history, prompt, secondarySelect.isReasoning, metadata);

      if (secondaryProvider === 'nvidia') {
        executionResult = await this.executeNvidiaRequest({
          messages: requestMessages,
          primaryModel: secondarySelect.model,
          fallbackModels: secondarySelect.fallbackModels,
          isReasoning: secondarySelect.isReasoning,
          maxTokens: secondarySelect.maxTokens
        });
      } else {
        executionResult = await this.executeGroqRequest({
          messages: requestMessages,
          primaryModel: secondarySelect.model,
          fallbackModels: secondarySelect.fallbackModels,
          isReasoning: secondarySelect.isReasoning,
          maxTokens: secondarySelect.maxTokens,
          reasoningEffort: secondarySelect.reasoningEffort,
          reasoningFormat: secondarySelect.reasoningFormat
        });
      }
    }

    const rawOutput = executionResult.content;
    let cleaned = this.cleanResponse(rawOutput);

    // 2. Defensive Single Retry if cleaned output is empty or invalid
    if (!cleaned) {
      logger.warn('[OUTPUT] Initial output contained reasoning/scaffolding only. Retrying once with strict direct answer prompt...');
      const baseMessages = requestMessages || this.prepareMessages(history, prompt, false, metadata);
      const retryMessages = [
        ...baseMessages,
        { role: 'user', content: '[IMPORTANT: Give ONLY the final conversational answer. Do not output reasoning or checks.]' }
      ];
      try {
        if (finalProviderUsed === 'nvidia') {
          const retryResult = await this.executeNvidiaRequest({
            messages: retryMessages,
            primaryModel: executionResult.actualModel,
            fallbackModels: [],
            isReasoning: false,
            maxTokens: config.simpleMaxTokens
          });
          cleaned = this.cleanResponse(retryResult.content);
        } else {
          const retryResult = await this.executeGroqRequest({
            messages: retryMessages,
            primaryModel: executionResult.actualModel,
            fallbackModels: [],
            isReasoning: false,
            maxTokens: config.simpleMaxTokens,
            reasoningEffort: 'none',
            reasoningFormat: 'hidden'
          });
          cleaned = this.cleanResponse(retryResult.content);
        }
      } catch (retryErr) {
        logger.warn(`Defensive retry failed: ${retryErr.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const finalClean = cleaned || "Sorry, what was that?";

    // Technical Process Output Log
    logger.info(`[OUTPUT] Status: SUCCESS | Provider: ${finalProviderUsed.toUpperCase()} | Model: ${executionResult.actualModel} | Latency: ${durationMs}ms | Preview: "${finalClean.substring(0, 80).replace(/\n/g, ' ')}..."`);

    return finalClean;
  }

  getStatus() {
    const provider = this.getActiveProvider();
    const activeKeys = provider === 'nvidia' ? this.nvidiaKeys : this.groqKeys;
    const activeIndex = provider === 'nvidia' ? this.nvidiaKeyIndex : this.groqKeyIndex;
    const groqKey = this.groqKeys.length > 0 ? this.maskKey(this.groqKeys[this.groqKeyIndex]) : '[NOT CONFIGURABLE]';
    const nvidiaKey = this.nvidiaKeys.length > 0 ? this.maskKey(this.nvidiaKeys[this.nvidiaKeyIndex]) : '[NOT CONFIGURABLE]';

    return {
      activeProvider: provider,
      activeKeyIndex: activeIndex,
      totalKeysConfigured: activeKeys.length,
      groq: {
        keysConfigured: this.groqKeys.length,
        activeKeyIndex: this.groqKeyIndex,
        activeMaskedKey: groqKey,
        routerModel: config.groqRouterModel || config.routerModel,
        routerFallbackModels: config.groqRouterFallbackModels,
        simpleModel: config.groqModelSimple,
        simpleFallbackModels: config.groqSimpleFallbackModels,
        reasoningModel: config.groqModelReasoning,
        reasoningFallbackModels: config.groqReasoningFallbackModels,
        pdfModel: config.groqModelPdf || config.groqModelReasoning,
        pdfFallbackModels: config.groqPdfFallbackModels || config.groqReasoningFallbackModels,
        pptxModel: config.groqModelPptx || config.groqModelReasoning,
        pptxFallbackModels: config.groqPptxFallbackModels || config.groqReasoningFallbackModels,
        multimodalModel: config.groqModelMultimodal,
        multimodalFallbackModels: config.groqMultimodalFallbackModels,
        audioModel: config.groqModelAudio,
        audioFallbackModels: config.groqAudioFallbackModels
      },
      nvidia: {
        keysConfigured: this.nvidiaKeys.length,
        activeKeyIndex: this.nvidiaKeyIndex,
        activeMaskedKey: nvidiaKey,
        routerModel: config.nvidiaRouterModel,
        routerFallbackModels: config.nvidiaRouterFallbackModels,
        simpleModel: config.nvidiaModelSimple,
        simpleFallbackModels: config.nvidiaSimpleFallbackModels,
        reasoningModel: config.nvidiaModelReasoning,
        reasoningFallbackModels: config.nvidiaReasoningFallbackModels,
        pdfModel: config.nvidiaModelPdf,
        pdfFallbackModels: config.nvidiaPdfFallbackModels,
        pptxModel: config.nvidiaModelPptx,
        pptxFallbackModels: config.nvidiaPptxFallbackModels,
        multimodalModel: config.nvidiaModelMultimodal,
        multimodalFallbackModels: config.nvidiaMultimodalFallbackModels,
        audioModel: config.nvidiaModelAudio,
        audioFallbackModels: config.nvidiaAudioFallbackModels
      }
    };
  }
}

export const aiProvider = new AIProviderManager();
