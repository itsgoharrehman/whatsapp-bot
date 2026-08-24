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
    this.keyHealth = new Map();
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

  /**
   * Cleans and repairs JSON strings if slightly truncated or wrapped in markdown fences.
   */
  cleanAndParseJson(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      throw new Error('Empty model response');
    }
    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const startIdx = cleaned.indexOf('{');
    if (startIdx === -1) throw new Error('No JSON object found in response');
    
    let candidate = cleaned.slice(startIdx);
    const endIdx = candidate.lastIndexOf('}');
    if (endIdx !== -1) {
      candidate = candidate.slice(0, endIdx + 1);
    }

    try {
      return JSON.parse(candidate);
    } catch (e1) {
      // JSON Repair: close unclosed brackets / quotes
      let repaired = candidate;
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;

      if (openBrackets > closeBrackets) {
        repaired += ']'.repeat(openBrackets - closeBrackets);
      }
      if (openBraces > closeBraces) {
        repaired += '}'.repeat(openBraces - closeBraces);
      }

      try {
        return JSON.parse(repaired);
      } catch (e2) {
        throw new Error(`JSON parse error: ${e1.message}`);
      }
    }
  }

  /**
   * Robust JSON execution: tries with json_object mode, falls back to raw mode on 400.
   */
  async executeSingleJsonRequest(apiKey, model, messages, maxTokens = 3500) {
    const client = this.getGroqClient(apiKey);

    // Attempt 1: Standard Groq SDK with json_object
    if (client) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages,
          temperature: 0.2,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
        });
        const raw = completion.choices?.[0]?.message?.content || '';
        return this.cleanAndParseJson(raw);
      } catch (err) {
        // If Groq rejects server-side JSON mode, retry in raw mode
        if (err.message?.includes('json_validate_failed') || err.message?.includes('400')) {
          logger.warn(`[RETRY:RAW] Retrying on key ${this.maskKey(apiKey)} without json_object mode...`);
          const retryCompletion = await client.chat.completions.create({
            model,
            messages: [
              ...messages,
              { role: 'user', content: 'Provide the response as a single raw valid JSON object. Do not include markdown or backticks.' }
            ],
            temperature: 0.2,
            max_tokens: maxTokens
          });
          const raw2 = retryCompletion.choices?.[0]?.message?.content || '';
          return this.cleanAndParseJson(raw2);
        }
        throw err;
      }
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
        temperature: 0.2,
        max_tokens: maxTokens
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    return this.cleanAndParseJson(raw);
  }

  /**
   * DISTRIBUTED PDF GENERATION ENGINE:
   * Splits work into 2-section chunks across parallel keys simultaneously.
   */
  async executeDistributedPdfGeneration({ prompt, quotedText = '', isOwner = false }) {
    const startTime = Date.now();
    // Cap sections to 4 for normal users, 6 for owner (optimal for fast, non-truncated parallel rendering)
    const targetSections = isOwner ? 6 : config.normalUserMaxPages;
    const keys = this.selectGroqKeys(2);
    const primaryKey = keys[0] || this.groqKeys[0];
    const secondaryKey = keys[1] || primaryKey;

    const modelA = config.groqArtifactPrimary || 'openai/gpt-oss-120b';
    const modelB = config.groqArtifactFallbacks?.[0] || 'openai/gpt-oss-20b';

    let userContext = prompt.trim();
    if (quotedText && quotedText.trim()) {
      userContext = `[SOURCE REFERENCE]:\n"""\n${quotedText.trim()}\n"""\n\n[USER TOPIC]:\n${userContext || 'Create a comprehensive structured document.'}`;
    }

    // STEP 1: MASTER BLUEPRINT / OUTLINE (Key A)
    logger.info(`[PARALLEL-DISTRIBUTED] Step 1: Generating Outline on Key #${this.maskKey(primaryKey)} (${modelA})`);
    const outlineMessages = [
      {
        role: 'system',
        content: `You are a Senior Publication Architect. Create a master structural JSON blueprint for a visual document on the user topic.
OUTPUT STRICT JSON ONLY:
{
  "title": "Document Title",
  "documentType": "document" | "guide" | "report" | "summary",
  "themeColor": "editorial_clean" | "retro_pixel" | "pastel_chic" | "playful_pop" | "aurora_neon",
  "sections": [
    { "sectionNumber": 1, "title": "Section Title 1", "synopsis": "Overview of this section" },
    { "sectionNumber": 2, "title": "Section Title 2", "synopsis": "Overview of this section" },
    { "sectionNumber": 3, "title": "Section Title 3", "synopsis": "Overview of this section" },
    { "sectionNumber": 4, "title": "Section Title 4", "synopsis": "Overview of this section" }
  ]
}`
      },
      { role: 'user', content: `${userContext}\n\nGenerate outline with exactly ${targetSections} sections in JSON format.` }
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
      throw new Error('Master outline failed to generate sections.');
    }

    // Split sections into 2 chunks (e.g. 2-3 sections per key)
    const midPoint = Math.ceil(plannedSections.length / 2);
    const chunk1Sections = plannedSections.slice(0, midPoint);
    const chunk2Sections = plannedSections.slice(midPoint);

    logger.info(`[PARALLEL-DISTRIBUTED] Step 2: Splitting ${plannedSections.length} sections across 2 keys simultaneously:
• Key A [${this.maskKey(primaryKey)}]: Sections 1..${chunk1Sections.length}
• Key B [${this.maskKey(secondaryKey)}]: Sections ${chunk1Sections.length + 1}..${plannedSections.length}`);

    const buildChunkPrompt = (sectionChunk, partLabel) => [
      {
        role: 'system',
        content: `You are a Publication Specialist writing ${partLabel} for "${outlineJson.title}".
Generate rich JSON content ONLY for these planned sections:
${JSON.stringify(sectionChunk, null, 2)}

OUTPUT STRICT JSON ONLY:
{
  "sections": [
    {
      "title": "Section Title",
      "subsections": [
        {
          "title": "Subsection Heading",
          "paragraphs": [ "Detailed descriptive paragraph 1", "Detailed descriptive paragraph 2" ],
          "cards": [ { "title": "Key Insight", "content": "Clear explanation", "variant": "info" } ],
          "kpis": [ { "value": "99.9%", "label": "Reliability Metric" } ],
          "tables": [ { "headers": ["Feature", "Description"], "rows": [["Colab GPU", "Free cloud compute"]] } ]
        }
      ]
    }
  ]
}
IMPORTANT: Write clean plain text in paragraphs. Do not use unescaped double quotes inside strings.`
      },
      { role: 'user', content: `Generate JSON for sections: ${sectionChunk.map(s => s.title).join(', ')}` }
    ];

    // STEP 2: SIMULTANEOUS PARALLEL CHUNK GENERATION (Promise.all)
    const [part1Res, part2Res] = await Promise.all([
      (async () => {
        try {
          const res = await this.executeSingleJsonRequest(primaryKey, modelA, buildChunkPrompt(chunk1Sections, 'Part 1'), 3000);
          this.recordKeySuccess(primaryKey);
          return res;
        } catch (err) {
          this.recordKeyError(primaryKey, err.message);
          return await this.executeSingleJsonRequest(secondaryKey, modelB, buildChunkPrompt(chunk1Sections, 'Part 1'), 3000);
        }
      })(),
      (async () => {
        try {
          const res = await this.executeSingleJsonRequest(secondaryKey, modelB, buildChunkPrompt(chunk2Sections, 'Part 2'), 3000);
          this.recordKeySuccess(secondaryKey);
          return res;
        } catch (err) {
          this.recordKeyError(secondaryKey, err.message);
          return await this.executeSingleJsonRequest(primaryKey, modelA, buildChunkPrompt(chunk2Sections, 'Part 2'), 3000);
        }
      })()
    ]);

    // STEP 3: ASSEMBLE ALL CHUNKS
    const assembledSections = [
      ...(Array.isArray(part1Res.sections) ? part1Res.sections : []),
      ...(Array.isArray(part2Res.sections) ? part2Res.sections : [])
    ];

    const finalDoc = {
      title: outlineJson.title || prompt.slice(0, 40) || 'Document',
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
   * Splits slide generation into 5-slide chunks across parallel keys simultaneously.
   */
  async executeDistributedPptxGeneration({ prompt, quotedText = '', isOwner = false }) {
    const startTime = Date.now();
    const targetSlides = isOwner ? 12 : config.normalUserMaxSlides;
    const keys = this.selectGroqKeys(2);
    const primaryKey = keys[0] || this.groqKeys[0];
    const secondaryKey = keys[1] || primaryKey;

    const modelA = config.groqArtifactPrimary || 'openai/gpt-oss-120b';
    const modelB = config.groqArtifactFallbacks?.[0] || 'openai/gpt-oss-20b';

    let userContext = prompt.trim();
    if (quotedText && quotedText.trim()) {
      userContext = `[SOURCE REFERENCE]:\n"""\n${quotedText.trim()}\n"""\n\n[USER TOPIC]:\n${userContext || 'Create an executive presentation deck.'}`;
    }

    // STEP 1: DECK BLUEPRINT (Key A)
    logger.info(`[PARALLEL-DISTRIBUTED] Step 1: Generating Presentation Blueprint on Key #${this.maskKey(primaryKey)} (${modelA})`);
    const blueprintMessages = [
      {
        role: 'system',
        content: `You are a Principal Executive Presentation Designer. Create a master slide deck JSON blueprint.
OUTPUT STRICT JSON ONLY:
{
  "title": "Presentation Title",
  "theme": "ocean_gradient" | "dark_matter" | "emerald_growth" | "sunset_coral" | "monochrome_bold" | "corporate_navy",
  "slides": [
    { "slideNumber": 1, "type": "title", "title": "Deck Title", "synopsis": "Opening" },
    { "slideNumber": 2, "type": "cards", "title": "Key Pillars", "synopsis": "Overview" }
    ... up to ${targetSlides} slides total
  ]
}`
      },
      { role: 'user', content: `${userContext}\n\nGenerate blueprint with exactly ${targetSlides} slides in JSON format.` }
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
      throw new Error('Master presentation blueprint failed to generate slides.');
    }

    // Split slides into 2 parallel chunks (e.g. 5-6 slides per key)
    const midPoint = Math.ceil(plannedSlides.length / 2);
    const chunk1Slides = plannedSlides.slice(0, midPoint);
    const chunk2Slides = plannedSlides.slice(midPoint);

    logger.info(`[PARALLEL-DISTRIBUTED] Step 2: Splitting ${plannedSlides.length} slides across 2 keys simultaneously:
• Key A [${this.maskKey(primaryKey)}]: Slides 1..${chunk1Slides.length}
• Key B [${this.maskKey(secondaryKey)}]: Slides ${chunk1Slides.length + 1}..${plannedSlides.length}`);

    const buildSlideChunkPrompt = (slideChunk, partLabel) => [
      {
        role: 'system',
        content: `You are a Presentation Specialist writing ${partLabel} for "${blueprintJson.title}".
Generate rich detailed slides ONLY for these planned slides:
${JSON.stringify(slideChunk, null, 2)}

OUTPUT STRICT JSON ONLY:
{
  "slides": [
    // Array of slide objects matching their types:
    // - type: "title" -> { "type": "title", "title": string, "subtitle"?: string }
    // - type: "cards" -> { "type": "cards", "title": string, "cards": [{ "title": string, "description": string }] }
    // - type: "kpi_grid" -> { "type": "kpi_grid", "title": string, "kpis": [{ "value": string, "label": string }] }
    // - type: "bullet_list" -> { "type": "bullet_list", "title": string, "items": string[] }
    // - type: "table" -> { "type": "table", "title": string, "headers": string[], "rows": string[][] }
    // - type: "comparison" -> { "type": "comparison", "title": string, "left": { "title": string, "points": string[] }, "right": { "title": string, "points": string[] } }
  ]
}
IMPORTANT: Write clean professional text. Do not use unescaped double quotes inside strings.`
      },
      { role: 'user', content: `Generate JSON for slides: ${slideChunk.map(s => `${s.slideNumber}. ${s.title}`).join(', ')}` }
    ];

    // STEP 2: SIMULTANEOUS PARALLEL CHUNK GENERATION (Promise.all)
    const [part1Res, part2Res] = await Promise.all([
      (async () => {
        try {
          const res = await this.executeSingleJsonRequest(primaryKey, modelA, buildSlideChunkPrompt(chunk1Slides, 'Part 1'), 3000);
          this.recordKeySuccess(primaryKey);
          return res;
        } catch (err) {
          this.recordKeyError(primaryKey, err.message);
          return await this.executeSingleJsonRequest(secondaryKey, modelB, buildSlideChunkPrompt(chunk1Slides, 'Part 1'), 3000);
        }
      })(),
      (async () => {
        try {
          const res = await this.executeSingleJsonRequest(secondaryKey, modelB, buildSlideChunkPrompt(chunk2Slides, 'Part 2'), 3000);
          this.recordKeySuccess(secondaryKey);
          return res;
        } catch (err) {
          this.recordKeyError(secondaryKey, err.message);
          return await this.executeSingleJsonRequest(primaryKey, modelA, buildSlideChunkPrompt(chunk2Slides, 'Part 2'), 3000);
        }
      })()
    ]);

    // STEP 3: ASSEMBLE ALL SLIDES
    const assembledSlides = [
      ...(Array.isArray(part1Res.slides) ? part1Res.slides : []),
      ...(Array.isArray(part2Res.slides) ? part2Res.slides : [])
    ];

    const finalDeck = {
      title: blueprintJson.title || prompt.slice(0, 40) || 'Presentation',
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
