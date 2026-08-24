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
    return Date.now() - stat.lastError < 15000 && stat.errors >= 2;
  }

  /**
   * Selects up to `count` distinct healthy Groq keys for parallel multi-key chunk generation.
   */
  selectGroqKeys(count = 2) {
    if (!this.groqKeys || this.groqKeys.length === 0) return [];
    
    const available = [...this.groqKeys]
      .filter(k => !this.isKeyCoolingDown(k))
      .sort(() => 0.5 - Math.random());

    if (available.length >= count) {
      return available.slice(0, count);
    }
    return [...this.groqKeys].sort(() => 0.5 - Math.random()).slice(0, Math.min(count, this.groqKeys.length));
  }

  cleanJsonString(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.slice(startIdx, endIdx + 1);
    }
    return cleaned;
  }

  /**
   * Executes a completion with automatic failover across keys and models.
   */
  async executeSingleJsonRequest(apiKey, model, messages, maxTokens = 2500) {
    const client = this.getGroqClient(apiKey);
    if (client) {
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: config.artifactTemperature || 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      });
      const raw = completion.choices?.[0]?.message?.content || '';
      return JSON.parse(this.cleanJsonString(raw));
    }

    // Direct HTTP fetch fallback
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
    const raw = data.choices?.[0]?.message?.content || '';
    return JSON.parse(this.cleanJsonString(raw));
  }

  /**
   * DISTRIBUTED PDF GENERATION ENGINE:
   * 1. Key 1 generates Master Outline & Theme
   * 2. Key 1 & Key 2 (or more keys) generate Sections in parallel chunks simultaneously (Promise.all)
   * 3. Merges chunks into cohesive publication document
   */
  async executeDistributedPdfGeneration({ prompt, quotedText = '', isOwner = false }) {
    const startTime = Date.now();
    const totalSections = isOwner ? config.ownerMaxPages : config.normalUserMaxPages;
    const keys = this.selectGroqKeys(2);
    const primaryKey = keys[0] || this.groqKeys[0];
    const secondaryKey = keys[1] || primaryKey;

    const modelA = config.groqArtifactPrimary || 'openai/gpt-oss-120b';
    const modelB = config.groqArtifactFallbacks?.[0] || 'openai/gpt-oss-20b';

    let userContext = prompt.trim();
    if (quotedText && quotedText.trim()) {
      userContext = `[SOURCE REFERENCE MATERIAL]:\n"""\n${quotedText.trim()}\n"""\n\n[USER INSTRUCTION]:\n${userContext || 'Create a comprehensive structured document.'}`;
    }

    // STEP 1: MASTER OUTLINE GENERATION (Key A)
    logger.info(`[PARALLEL-DISTRIBUTED] Step 1: Generating Outline on Key #${this.maskKey(primaryKey)} (${modelA})`);
    const outlineMessages = [
      {
        role: 'system',
        content: `You are a Senior Publication Architect. Create a master structural blueprint for a visual document on the user's topic.
OUTPUT JSON ONLY:
{
  "title": string,
  "documentType": "document" | "guide" | "report" | "summary",
  "themeColor": "editorial_clean" | "retro_pixel" | "pastel_chic" | "playful_pop" | "aurora_neon",
  "sections": [
    { "sectionNumber": 1, "title": string, "synopsis": string },
    { "sectionNumber": 2, "title": string, "synopsis": string },
    ... up to ${totalSections} sections
  ]
}`
      },
      { role: 'user', content: userContext }
    ];

    let outlineJson;
    try {
      outlineJson = await this.executeSingleJsonRequest(primaryKey, modelA, outlineMessages, 1500);
      this.recordKeySuccess(primaryKey);
    } catch (err) {
      this.recordKeyError(primaryKey, err.message);
      outlineJson = await this.executeSingleJsonRequest(secondaryKey, modelB, outlineMessages, 1500);
    }

    const plannedSections = Array.isArray(outlineJson.sections) ? outlineJson.sections : [];
    if (plannedSections.length === 0) {
      throw new Error('Master outline failed to generate valid sections.');
    }

    // Split sections into 2 parallel chunks (e.g. Half on Key A, Half on Key B)
    const midPoint = Math.ceil(plannedSections.length / 2);
    const chunk1Sections = plannedSections.slice(0, midPoint);
    const chunk2Sections = plannedSections.slice(midPoint);

    logger.info(`[PARALLEL-DISTRIBUTED] Step 2: Splitting ${plannedSections.length} sections across 2 keys simultaneously:
• Key A [${this.maskKey(primaryKey)}]: Sections 1..${chunk1Sections.length}
• Key B [${this.maskKey(secondaryKey)}]: Sections ${chunk1Sections.length + 1}..${plannedSections.length}`);

    const buildChunkPrompt = (sectionChunk, partName) => [
      {
        role: 'system',
        content: `You are a Publication Section Specialist writing ${partName} for "${outlineJson.title}".
Generate rich, complete content ONLY for these planned sections:
${JSON.stringify(sectionChunk, null, 2)}

OUTPUT JSON ONLY:
{
  "sections": [
    {
      "title": string,
      "subsections": [
        {
          "title": string,
          "paragraphs": string[],
          "cards": [ { "title": string, "content": string, "variant": "info"|"warning"|"success"|"quote"|"neutral" } ],
          "kpis": [ { "value": string, "label": string, "change"?: string } ],
          "tables": [ { "headers": string[], "rows": string[][] } ]
        }
      ]
    }
  ]
}
Write genuine, insightful, and comprehensive text. Do not output placeholders.`
      },
      { role: 'user', content: `Write comprehensive content for sections: ${sectionChunk.map(s => s.title).join(', ')}` }
    ];

    // STEP 2: SIMULTANEOUS PARALLEL CHUNK GENERATION (Promise.all)
    const [part1Res, part2Res] = await Promise.all([
      (async () => {
        try {
          const res = await this.executeSingleJsonRequest(primaryKey, modelA, buildChunkPrompt(chunk1Sections, 'Part 1 (First Half)'), 2500);
          this.recordKeySuccess(primaryKey);
          return res;
        } catch (err) {
          this.recordKeyError(primaryKey, err.message);
          return await this.executeSingleJsonRequest(secondaryKey, modelB, buildChunkPrompt(chunk1Sections, 'Part 1 (First Half)'), 2500);
        }
      })(),
      (async () => {
        try {
          const res = await this.executeSingleJsonRequest(secondaryKey, modelB, buildChunkPrompt(chunk2Sections, 'Part 2 (Second Half)'), 2500);
          this.recordKeySuccess(secondaryKey);
          return res;
        } catch (err) {
          this.recordKeyError(secondaryKey, err.message);
          return await this.executeSingleJsonRequest(primaryKey, modelA, buildChunkPrompt(chunk2Sections, 'Part 2 (Second Half)'), 2500);
        }
      })()
    ]);

    // STEP 3: ASSEMBLE ALL CHUNKS INTO FINAL DOCUMENT
    const assembledSections = [
      ...(Array.isArray(part1Res.sections) ? part1Res.sections : []),
      ...(Array.isArray(part2Res.sections) ? part2Res.sections : [])
    ];

    const finalDoc = {
      title: outlineJson.title || 'Document',
      documentType: outlineJson.documentType || 'report',
      themeColor: outlineJson.themeColor || 'editorial_clean',
      sections: assembledSections
    };

    const totalLatency = Date.now() - startTime;
    logger.info(`[PARALLEL-DISTRIBUTED:SUCCESS] Assembled ${assembledSections.length} sections in ${totalLatency}ms using 2 keys in parallel!`);

    return {
      json: finalDoc,
      latencyMs: totalLatency,
      modelUsed: `${modelA} + ${modelB}`,
      keyUsed: `${this.maskKey(primaryKey)} + ${this.maskKey(secondaryKey)}`
    };
  }

  /**
   * DISTRIBUTED PPTX GENERATION ENGINE:
   * 1. Key 1 generates Master Deck Blueprint (Theme + 10 Slide Titles)
   * 2. Key 1 (Slides 1..5) and Key 2 (Slides 6..10) generate detailed slide contents simultaneously (Promise.all)
   * 3. Merges slides into final PowerPoint deck
   */
  async executeDistributedPptxGeneration({ prompt, quotedText = '', isOwner = false }) {
    const startTime = Date.now();
    const totalSlides = isOwner ? config.ownerMaxSlides : config.normalUserMaxSlides;
    const keys = this.selectGroqKeys(2);
    const primaryKey = keys[0] || this.groqKeys[0];
    const secondaryKey = keys[1] || primaryKey;

    const modelA = config.groqArtifactPrimary || 'openai/gpt-oss-120b';
    const modelB = config.groqArtifactFallbacks?.[0] || 'openai/gpt-oss-20b';

    let userContext = prompt.trim();
    if (quotedText && quotedText.trim()) {
      userContext = `[SOURCE REFERENCE MATERIAL]:\n"""\n${quotedText.trim()}\n"""\n\n[USER TOPIC]:\n${userContext || 'Create an executive presentation deck.'}`;
    }

    // STEP 1: DECK BLUEPRINT (Key A)
    logger.info(`[PARALLEL-DISTRIBUTED] Step 1: Generating Presentation Blueprint on Key #${this.maskKey(primaryKey)} (${modelA})`);
    const blueprintMessages = [
      {
        role: 'system',
        content: `You are a Principal Executive Presentation Designer. Create a master slide deck blueprint for the user's topic.
OUTPUT JSON ONLY:
{
  "title": string,
  "theme": "ocean_gradient" | "dark_matter" | "emerald_growth" | "sunset_coral" | "monochrome_bold" | "corporate_navy",
  "slides": [
    { "slideNumber": 1, "type": "title", "title": string, "synopsis": string },
    { "slideNumber": 2, "type": "kpi_grid" | "cards" | "bullet_list" | "table" | "comparison", "title": string, "synopsis": string },
    ... exactly ${totalSlides} slides total
  ]
}`
      },
      { role: 'user', content: userContext }
    ];

    let blueprintJson;
    try {
      blueprintJson = await this.executeSingleJsonRequest(primaryKey, modelA, blueprintMessages, 1500);
      this.recordKeySuccess(primaryKey);
    } catch (err) {
      this.recordKeyError(primaryKey, err.message);
      blueprintJson = await this.executeSingleJsonRequest(secondaryKey, modelB, blueprintMessages, 1500);
    }

    const plannedSlides = Array.isArray(blueprintJson.slides) ? blueprintJson.slides : [];
    if (plannedSlides.length === 0) {
      throw new Error('Master presentation blueprint failed to generate valid slides.');
    }

    // Split slides into 2 parallel chunks (e.g. Slides 1..5 on Key A, Slides 6..10 on Key B)
    const midPoint = Math.ceil(plannedSlides.length / 2);
    const chunk1Slides = plannedSlides.slice(0, midPoint);
    const chunk2Slides = plannedSlides.slice(midPoint);

    logger.info(`[PARALLEL-DISTRIBUTED] Step 2: Splitting ${plannedSlides.length} slides across 2 keys simultaneously:
• Key A [${this.maskKey(primaryKey)}]: Slides 1..${chunk1Slides.length}
• Key B [${this.maskKey(secondaryKey)}]: Slides ${chunk1Slides.length + 1}..${plannedSlides.length}`);

    const buildSlideChunkPrompt = (slideChunk, partName) => [
      {
        role: 'system',
        content: `You are a Presentation Specialist writing ${partName} for "${blueprintJson.title}".
Generate rich detailed slides ONLY for these planned slides:
${JSON.stringify(slideChunk, null, 2)}

OUTPUT JSON ONLY:
{
  "slides": [
    // Array of slide objects matching their types:
    // - type: "title" -> { type: "title", title: string, subtitle?: string }
    // - type: "cards" -> { type: "cards", title: string, cards: [{ title: string, description: string, badge?: string }] }
    // - type: "kpi_grid" -> { type: "kpi_grid", title: string, kpis: [{ value: string, label: string, change?: string }] }
    // - type: "bullet_list" -> { type: "bullet_list", title: string, items: string[] }
    // - type: "table" -> { type: "table", title: string, headers: string[], rows: string[][] }
    // - type: "comparison" -> { type: "comparison", title: string, left: { title: string, points: string[] }, right: { title: string, points: string[] } }
  ]
}
Provide rich, high-density professional presentation content. Never output placeholders.`
      },
      { role: 'user', content: `Generate detailed slides for: ${slideChunk.map(s => `${s.slideNumber}. ${s.title}`).join(', ')}` }
    ];

    // STEP 2: SIMULTANEOUS PARALLEL CHUNK GENERATION (Promise.all)
    const [part1Res, part2Res] = await Promise.all([
      (async () => {
        try {
          const res = await this.executeSingleJsonRequest(primaryKey, modelA, buildSlideChunkPrompt(chunk1Slides, 'Part 1 (Slides 1 to ' + chunk1Slides.length + ')'), 2500);
          this.recordKeySuccess(primaryKey);
          return res;
        } catch (err) {
          this.recordKeyError(primaryKey, err.message);
          return await this.executeSingleJsonRequest(secondaryKey, modelB, buildSlideChunkPrompt(chunk1Slides, 'Part 1'), 2500);
        }
      })(),
      (async () => {
        try {
          const res = await this.executeSingleJsonRequest(secondaryKey, modelB, buildSlideChunkPrompt(chunk2Slides, 'Part 2 (Slides ' + (chunk1Slides.length + 1) + ' to ' + plannedSlides.length + ')'), 2500);
          this.recordKeySuccess(secondaryKey);
          return res;
        } catch (err) {
          this.recordKeyError(secondaryKey, err.message);
          return await this.executeSingleJsonRequest(primaryKey, modelA, buildSlideChunkPrompt(chunk2Slides, 'Part 2'), 2500);
        }
      })()
    ]);

    // STEP 3: ASSEMBLE ALL SLIDES INTO FINAL PRESENTATION
    const assembledSlides = [
      ...(Array.isArray(part1Res.slides) ? part1Res.slides : []),
      ...(Array.isArray(part2Res.slides) ? part2Res.slides : [])
    ];

    const finalDeck = {
      title: blueprintJson.title || 'Presentation',
      theme: blueprintJson.theme || 'ocean_gradient',
      slides: assembledSlides
    };

    const totalLatency = Date.now() - startTime;
    logger.info(`[PARALLEL-DISTRIBUTED:SUCCESS] Assembled ${assembledSlides.length} slides in ${totalLatency}ms using 2 keys in parallel!`);

    return {
      json: finalDeck,
      latencyMs: totalLatency,
      modelUsed: `${modelA} + ${modelB}`,
      keyUsed: `${this.maskKey(primaryKey)} + ${this.maskKey(secondaryKey)}`
    };
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
