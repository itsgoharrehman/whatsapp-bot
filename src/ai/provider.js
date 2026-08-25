import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { db } from '../utils/db.js';

let GroqSDK = null;
try {
  const mod = await import('groq-sdk');
  GroqSDK = mod.default?.default || mod.default || mod.Groq || mod;
} catch (err) {}

export const VALID_PDF_THEMES = [
  'editorial_clean',
  'retro_pixel',
  'pastel_chic',
  'playful_pop',
  'aurora_neon'
];

export const VALID_PPTX_THEMES = [
  'modern_minimal',
  'tech_indigo',
  'corporate_blue',
  'dark_slate',
  'emerald_growth',
  'crimson_bold',
  'sunset_amber',
  'cyberpunk',
  'academic_navy',
  'purple_luxury'
];

class AIProviderManager {
  constructor() {
    this.groqKeys = config.groqKeys || [];
    this.groqClients = new Map();
    this.nvidiaKeys = config.nvidiaKeys || [];
    this.keyHealth = new Map();
    this.activeProvider = (config.defaultProvider || 'groq').toLowerCase();
  }

  setProvider(provider) {
    const p = String(provider).toLowerCase().trim();
    if (p === 'groq' || p === 'nvidia') {
      this.activeProvider = p;
      return true;
    }
    return false;
  }

  getProvider() {
    return this.activeProvider;
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
  }

  isKeyCoolingDown(key) {
    const stat = this.keyHealth.get(key);
    if (!stat || stat.errors === 0) return false;
    return Date.now() - stat.lastError < 20000 && stat.errors >= 2;
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

  selectNvidiaKey() {
    if (!this.nvidiaKeys || this.nvidiaKeys.length === 0) return null;
    const available = [...this.nvidiaKeys]
      .filter(k => !this.isKeyCoolingDown(k))
      .sort(() => 0.5 - Math.random());
    return available[0] || this.nvidiaKeys[0];
  }

  /**
   * Cleans and repairs JSON strings if wrapped in markdown fences or slightly truncated.
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
   * Executes a JSON request against NVIDIA NIM endpoints.
   */
  async executeNvidiaJsonRequest(apiKey, model, messages, maxTokens = 3500) {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || config.nvidiaArtifactPrimary || 'meta/llama-3.3-70b-instruct',
        messages: [
          ...messages,
          { role: 'user', content: 'Respond with valid JSON only. Do not use markdown backticks or extra commentary.' }
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`NVIDIA HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    return this.cleanAndParseJson(raw);
  }

  /**
   * Executes a JSON request against Groq SDK or fallback HTTP.
   */
  async executeGroqJsonRequest(apiKey, model, messages, maxTokens = 2500) {
    const client = this.getGroqClient(apiKey);
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
        // Fallback without json_object on schema error
        const retry = await client.chat.completions.create({
          model,
          messages: [
            ...messages,
            { role: 'user', content: 'Output strict JSON only without markdown or backticks.' }
          ],
          temperature: 0.2,
          max_tokens: maxTokens
        });
        const raw2 = retry.choices?.[0]?.message?.content || '';
        return this.cleanAndParseJson(raw2);
      }
    }

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
      signal: AbortSignal.timeout(25000)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    return this.cleanAndParseJson(raw);
  }

  /**
   * Ironclad extraction of theme, requested pages/slides, and clean subject topic.
   */
  /**
   * Universal Theme and Topic Extractor
   * Supports --theme=<name>, --theme <name>, -t <name>, 'in <name> style', 'with <name> theme', and aliases.
   */
  extractThemeAndTopic(rawPrompt, type = 'pdf') {
    if (!rawPrompt || typeof rawPrompt !== 'string') {
      return {
        topic: type === 'pdf' ? 'Document' : 'Presentation',
        theme: type === 'pdf' ? 'editorial_clean' : 'modern_minimal',
        requestedPages: null
      };
    }

    let text = rawPrompt.trim();
    let explicitTheme = null;
    let requestedPages = null;

    const PDF_THEME_ALIASES = {
      retro_pixel: ['retro_pixel', 'retro', 'pixel', 'terminal', '8bit', 'arcade', 'vintage'],
      pastel_chic: ['pastel_chic', 'pastel', 'chic', 'boutique', 'lavender', 'pink'],
      playful_pop: ['playful_pop', 'playful', 'pop', 'candy', 'yellow', 'memphis'],
      aurora_neon: ['aurora_neon', 'aurora', 'neon', 'glow'],
      editorial_clean: ['editorial_clean', 'editorial', 'clean', 'bw', 'b&w', 'black_and_white', 'minimal', 'classic', 'monochrome']
    };

    const PPTX_THEME_ALIASES = {
      modern_minimal: ['modern_minimal', 'modern', 'minimal', 'clean', 'monochrome', 'bw'],
      tech_indigo: ['tech_indigo', 'indigo', 'tech', 'cyan', 'mint'],
      corporate_blue: ['corporate_blue', 'corporate', 'blue', 'enterprise', 'navy'],
      dark_slate: ['dark_slate', 'dark', 'slate', 'night'],
      emerald_growth: ['emerald_growth', 'emerald', 'growth', 'green', 'forest', 'finance'],
      crimson_bold: ['crimson_bold', 'crimson', 'bold', 'red', 'ruby'],
      sunset_amber: ['sunset_amber', 'sunset', 'amber', 'orange', 'creative'],
      cyberpunk: ['cyberpunk', 'cyber', 'neon', 'magenta', 'violet'],
      academic_navy: ['academic_navy', 'academic', 'university', 'formal'],
      purple_luxury: ['purple_luxury', 'luxury', 'purple', 'gold', 'royal', 'premium']
    };

    const resolveThemeFromCandidate = (candidate) => {
      if (!candidate) return null;
      const clean = candidate.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
      const aliasMap = type === 'pdf' ? PDF_THEME_ALIASES : PPTX_THEME_ALIASES;
      for (const [themeName, aliases] of Object.entries(aliasMap)) {
        if (themeName === clean || aliases.includes(clean)) {
          return themeName;
        }
      }
      return null;
    };

    // 1. Match explicit flag formats: --theme=name, --theme name, --theme+name, --theme:name, -theme name, -t name
    const flagPatterns = [
      /(?:--|-)?theme[-+=:\s]+([a-zA-Z0-9_]+)/i,
      /-t[-+=:\s]+([a-zA-Z0-9_]+)/i,
      /(?:in|with|using)\s+(?:the\s+)?([a-zA-Z0-9_]+)\s+(?:theme|style|mode)/i,
      /\b([a-zA-Z0-9_]+)\s+(?:theme|style)\b/i
    ];

    for (const pattern of flagPatterns) {
      const match = text.match(pattern);
      if (match) {
        const resolved = resolveThemeFromCandidate(match[1]);
        if (resolved) {
          explicitTheme = resolved;
          text = text.replace(match[0], ' ');
          break;
        }
      }
    }

    // 2. Extract requested pages/slides (e.g. "4 page", "4-page", "5 pages", "10 slides", "8 slide")
    const pageMatch = text.match(/\b(\d+)\s*[- ]*(?:pages?|page|pgs?|pg|slides?|slide|decks?)\b/i);
    if (pageMatch) {
      requestedPages = parseInt(pageMatch[1], 10);
      text = text.replace(pageMatch[0], ' ');
    }

    // 3. Iteratively strip residual theme flags, formatting commands, and noise words
    text = text.replace(/(?:--|-)?theme[-+=:\s]*[a-zA-Z0-9_]*/gi, ' ');
    text = text.replace(/-t[-+=:\s]*[a-zA-Z0-9_]*/gi, ' ');
    text = text.replace(/--[a-zA-Z0-9_-]+/gi, ' ');

    // Strip command prefixes (e.g. /pdf, /ppt, /pptx, /doc, pdf, ppt)
    text = text.replace(/^\/?(?:pdf|ppt|pptx|doc|skill|presentation|report|guide)\b/gi, ' ');

    // Strip action verbs (e.g. generate, create, make, build, write)
    text = text.replace(/^(?:\s*please\s+)?(?:\s*can\s+you\s+)?(?:\s*generate|\s*create|\s*make|\s*write|\s*build|\s*produce|\s*design|\s*provide|\s*give\s+me)\s+(?:a|an|the)?\s*/gi, ' ');

    // Strip format keywords (e.g. "pdf", "pitch deck", "presentation", "report")
    text = text.replace(/\b(?:pdf|document|doc|report|guide|presentation|ppt|pptx|slides?|deck|pitch\s+deck)\b/gi, ' ');

    // Strip prepositions
    text = text.replace(/^\s*(?:about|on|for|regarding|of|in)\s+/gi, ' ');
    text = text.replace(/\s+(?:about|on|for|regarding|of|in)\s*$/gi, ' ');

    // Normalize spacing
    text = text.replace(/\s+/g, ' ').trim();

    const finalTheme = explicitTheme || (type === 'pdf' ? 'editorial_clean' : 'modern_minimal');
    const finalTopic = text || (type === 'pdf' ? 'Document' : 'Presentation');

    return { topic: finalTopic, theme: finalTheme, requestedPages };
  }

  /**
   * PDF GENERATION ENGINE
   * Executes distributed multi-key parallel synthesis on Groq or high-token generation on NVIDIA.
   */
  async executeDistributedPdfGeneration({ prompt, quotedText = '', isOwner = false }) {
    const startTime = Date.now();
    const { topic, theme, requestedPages } = this.extractThemeAndTopic(prompt, 'pdf');
    const targetSections = requestedPages
      ? Math.max(2, Math.min(requestedPages, isOwner ? config.ownerMaxPages : config.normalUserMaxPages))
      : (isOwner ? 6 : config.normalUserMaxPages);

    let userContext = `Subject Matter: "${topic}"`;
    if (quotedText && quotedText.trim()) {
      userContext = `[SOURCE REFERENCE]:\n"""\n${quotedText.trim()}\n"""\n\n[SUBJECT MATTER]:\n"${topic}"`;
    }

    // 1. Try Primary Provider (Groq or NVIDIA)
    if (this.activeProvider === 'nvidia' && this.nvidiaKeys.length > 0) {
      try {
        logger.info(`[PDF] [STEP 1/3] Synthesizing "${topic}" on NVIDIA NIM...`);
        const res = await this.generatePdfSingleShotNvidia(topic, theme, targetSections, userContext);
        const totalLatency = Date.now() - startTime;
        return { json: res.doc, latencyMs: totalLatency, modelUsed: res.model, provider: 'NVIDIA' };
      } catch (nvidiaErr) {
        logger.warn(`[PDF] NVIDIA NIM failed (${nvidiaErr.message}). Switching to Groq distributed engine...`);
      }
    }

    // 2. Groq Multi-Key Distributed Parallel Pipeline
    try {
      const keys = this.selectGroqKeys(2);
      const keyA = keys[0] || this.groqKeys[0];
      const keyB = keys[1] || keyA;

      if (!keyA) throw new Error('No Groq API keys configured');

      logger.info(`[PDF] [STEP 1/3] Synthesizing blueprint for "${topic}" (${targetSections} sections)...`);

      // Step 1: Master Blueprint (Key A)
      const blueprintMessages = [
        {
          role: 'system',
          content: `You are a Principal Publication Architect. Create the blueprint outline for an in-depth document on the subject matter "${topic}".
CRITICAL: The prompt is the subject topic. DO NOT create meta-headings like "4-Page PDF" or "Creating a PDF". Every section must be an authentic domain chapter.
Output JSON:
{
  "title": "Comprehensive Subject Title",
  "documentType": "guide",
  "themeColor": "${theme}",
  "sectionOutlines": [
    { "index": 1, "title": "Real Topic Section 1 Title", "focus": "Deep architectural and operational aspects" }
  ]
}`
        },
        { role: 'user', content: `${userContext}\n\nProvide blueprint outline with exactly ${targetSections} distinct sectionOutlines in strict JSON.` }
      ];

      const model = config.groqArtifactPrimary || 'openai/gpt-oss-120b';
      const blueprintRes = await this.executeGroqJsonRequest(keyA, model, blueprintMessages, 1200);
      this.recordKeySuccess(keyA);

      const sectionOutlines = Array.isArray(blueprintRes.sectionOutlines) ? blueprintRes.sectionOutlines : [];
      if (sectionOutlines.length === 0) {
        for (let i = 1; i <= targetSections; i++) {
          sectionOutlines.push({ index: i, title: `${topic}: Part ${i}`, focus: 'Core insights and technical details' });
        }
      }

      logger.info(`[PDF] [STEP 2/3] Synthesizing ${sectionOutlines.length} sections in parallel on 2 Groq keys...`);

      // Step 2: Distributed Parallel Section Synthesis
      const half = Math.ceil(sectionOutlines.length / 2);
      const batchA = sectionOutlines.slice(0, half);
      const batchB = sectionOutlines.slice(half);

      const buildSectionPrompt = (batch) => [
        {
          role: 'system',
          content: `You are a Principal Technical Writer. Generate rich, publication-grade document sections in structured JSON for the subject "${topic}".

CRITICAL FORMATTING REQUIREMENTS:
Every section MUST contain diverse visual formatting elements:
1. "heading": Section H2 title
2. "subheading": Specific focus H3 subtitle
3. "paragraphs": 2 descriptive, high-value paragraphs (70-100 words each)
4. "bulletPoints": 3-4 structured key takeaways and technical points
5. "numberedSteps": 2-3 actionable implementation steps
6. "callout": An "important" or "tip" callout box with {"type": "important", "title": "Important Architecture Note", "text": "Crucial details and considerations"}
7. "table": A structured comparison/specification table with {"title": "Key Metrics & Specifications", "headers": ["Component", "Specification", "Impact"], "rows": [["Runtime", "High Throughput", "Optimal"], ["Storage", "NVMe SSD", "Sub-millisecond"]]}

OUTPUT STRICT JSON ONLY:
{
  "sections": [
    {
      "heading": "Section Heading",
      "subheading": "Subsection Title",
      "paragraphs": [
        "In-depth descriptive paragraph explaining concepts in full technical detail.",
        "Second extensive paragraph detailing specific workflows and operational mechanisms."
      ],
      "bulletPoints": [
        "Core Feature: In-depth technical specifications and architectural advantages.",
        "Performance Impact: Measurable efficiency gains and real-world benchmarks."
      ],
      "numberedSteps": [
        "Phase 1: Environment provisioning and dependency initialization.",
        "Phase 2: Execution pipeline deployment and validation."
      ],
      "callout": {
        "type": "important",
        "title": "Important Architectural Note",
        "text": "Essential best practices, security requirements, and operational warnings."
      },
      "table": {
        "title": "Feature & Specification Matrix",
        "headers": ["Feature", "Standard Tier", "Enterprise Tier"],
        "rows": [
          ["Compute Capacity", "Shared High-Speed Core", "Dedicated Distributed Cluster"],
          ["Storage Volume", "100 GB Cloud Storage", "Unlimited Scalable Storage"]
        ]
      }
    }
  ]
}`
        },
        { role: 'user', content: `Generate sections for:\n${JSON.stringify(batch, null, 2)}` }
      ];

      const fallbackModel = config.groqArtifactFallbacks?.[0] || 'openai/gpt-oss-20b';

      const [resBatchA, resBatchB] = await Promise.all([
        this.executeGroqJsonRequest(keyA, model, buildSectionPrompt(batchA), 2600)
          .catch(() => this.executeGroqJsonRequest(keyA, fallbackModel, buildSectionPrompt(batchA), 2600)),
        this.executeGroqJsonRequest(keyB, model, buildSectionPrompt(batchB), 2600)
          .catch(() => this.executeGroqJsonRequest(keyB, fallbackModel, buildSectionPrompt(batchB), 2600))
      ]);

      const sections = [
        ...(Array.isArray(resBatchA.sections) ? resBatchA.sections : []),
        ...(Array.isArray(resBatchB.sections) ? resBatchB.sections : [])
      ];

      logger.info(`[PDF] [STEP 3/3] Compiling vector PDF "${blueprintRes.title || topic}"...`);

      const finalDoc = {
        title: blueprintRes.title || topic,
        documentType: blueprintRes.documentType || 'guide',
        themeColor: theme,
        sections: sections.length > 0 ? sections : sectionOutlines.map(o => ({
          heading: o.title,
          subheading: o.focus,
          paragraphs: [`Comprehensive exploration of ${o.title} in relation to ${topic}.`]
        }))
      };

      const totalLatency = Date.now() - startTime;
      return {
        json: finalDoc,
        latencyMs: totalLatency,
        modelUsed: `${model} + ${fallbackModel}`,
        provider: 'Groq'
      };
    } catch (groqErr) {
      // 3. Fallback to NVIDIA NIM if Groq failed
      if (this.nvidiaKeys.length > 0) {
        logger.warn(`[PDF] Groq engine failed (${groqErr.message}). Falling back to NVIDIA NIM...`);
        const res = await this.generatePdfSingleShotNvidia(topic, theme, targetSections, userContext);
        const totalLatency = Date.now() - startTime;
        return { json: res.doc, latencyMs: totalLatency, modelUsed: res.model, provider: 'NVIDIA' };
      }
      throw groqErr;
    }
  }

  async generatePdfSingleShotNvidia(topic, theme, targetSections, userContext) {
    const nvidiaKey = this.selectNvidiaKey();
    if (!nvidiaKey) throw new Error('No NVIDIA API keys configured');

    const messages = [
      {
        role: 'system',
        content: `You are a Principal Publication Architect. Generate an exhaustive document in structured JSON for the subject "${topic}".
DO NOT create meta-headings about "4-Page PDF" or "Creating a PDF". Every section must be an authentic domain chapter.
Every section MUST contain diverse visual formatting: "heading", "subheading", "paragraphs", "bulletPoints", "numberedSteps", "callout", and "table".
Output JSON:
{
  "title": "Comprehensive Topic Title",
  "documentType": "guide",
  "themeColor": "${theme}",
  "sections": [
    {
      "heading": "Section Heading",
      "subheading": "Subsection Title",
      "paragraphs": ["Detailed descriptive paragraph.", "Second informative paragraph."],
      "bulletPoints": ["Key point 1", "Key point 2"],
      "numberedSteps": ["Step 1", "Step 2"],
      "callout": { "type": "important", "title": "Important Architectural Note", "text": "Crucial details and considerations" },
      "table": { "headers": ["Feature", "Specification", "Impact"], "rows": [["Item 1", "Specification 1", "Impact 1"]] }
    }
  ]
}`
      },
      { role: 'user', content: `${userContext}\n\nGenerate document with exactly ${targetSections} sections in strict JSON.` }
    ];

    const model = config.nvidiaArtifactPrimary || 'meta/llama-3.3-70b-instruct';
    const res = await this.executeNvidiaJsonRequest(nvidiaKey, model, messages, 3500);
    this.recordKeySuccess(nvidiaKey);

    return {
      doc: {
        title: res.title || topic,
        documentType: res.documentType || 'guide',
        themeColor: theme,
        sections: Array.isArray(res.sections) ? res.sections : []
      },
      model
    };
  }

  /**
   * PPTX GENERATION ENGINE
   */
  async executeDistributedPptxGeneration({ prompt, quotedText = '', isOwner = false }) {
    const startTime = Date.now();
    const { topic, theme, requestedPages } = this.extractThemeAndTopic(prompt, 'pptx');
    const targetSlides = requestedPages
      ? Math.max(3, Math.min(requestedPages, isOwner ? config.ownerMaxSlides : config.normalUserMaxSlides))
      : (isOwner ? 10 : config.normalUserMaxSlides);

    let userContext = `Subject Matter: "${topic}"`;
    if (quotedText && quotedText.trim()) {
      userContext = `[SOURCE REFERENCE]:\n"""\n${quotedText.trim()}\n"""\n\n[SUBJECT MATTER]:\n"${topic}"`;
    }

    logger.info(`[PPTX] [STEP 1/3] Synthesizing presentation outline for "${topic}" (${targetSlides} slides)...`);

    const messages = [
      {
        role: 'system',
        content: `You are a Principal Executive Presentation Designer. Generate an executive slide deck in structured JSON on the subject "${topic}".
DO NOT create meta-slides about "Creating a presentation" or "Slide deck overview". Every slide must have an authentic domain purpose.
Output JSON:
{
  "title": "Executive Presentation Title",
  "theme": "${theme}",
  "slides": [
    { "type": "title", "title": "Deck Title", "subtitle": "Subtitle text" },
    { "type": "cards", "title": "Strategic Pillars", "cards": [{ "title": "Pillar 1", "description": "In-depth details" }] },
    { "type": "kpi_grid", "title": "Impact Metrics", "kpis": [{ "value": "10x", "label": "Performance Gain" }] },
    { "type": "bullet_list", "title": "Core Capabilities", "items": ["Key capability 1", "Key capability 2"] },
    { "type": "table", "title": "Comparison Matrix", "headers": ["Feature", "Standard", "Enterprise"], "rows": [["Compute", "Shared", "Dedicated"]] },
    { "type": "comparison", "title": "Comparative Analysis", "left": { "title": "Option A", "points": ["Advantage 1"] }, "right": { "title": "Option B", "points": ["Advantage 2"] } }
  ]
}`
      },
      { role: 'user', content: `${userContext}\n\nGenerate complete slide deck with exactly ${targetSlides} slides in strict JSON.` }
    ];

    let presJson = null;
    let modelUsed = '';
    let providerUsed = '';

    if (this.activeProvider === 'nvidia' && this.nvidiaKeys.length > 0) {
      try {
        const nKey = this.selectNvidiaKey();
        modelUsed = config.nvidiaArtifactPrimary || 'meta/llama-3.3-70b-instruct';
        presJson = await this.executeNvidiaJsonRequest(nKey, modelUsed, messages, 3500);
        providerUsed = 'NVIDIA';
      } catch (nErr) {
        logger.warn(`[PPTX] NVIDIA failed. Falling back to Groq...`);
      }
    }

    if (!presJson) {
      const gKeys = this.selectGroqKeys(1);
      const gKey = gKeys[0] || this.groqKeys[0];
      if (!gKey) throw new Error('No AI provider keys available');
      modelUsed = config.groqArtifactPrimary || 'openai/gpt-oss-120b';
      presJson = await this.executeGroqJsonRequest(gKey, modelUsed, messages, 2800);
      providerUsed = 'Groq';
    }

    logger.info(`[PPTX] [STEP 2/3] Rendering native 16:9 PowerPoint presentation...`);

    const finalDeck = {
      title: presJson.title || topic || 'Presentation',
      theme: theme,
      slides: Array.isArray(presJson.slides) ? presJson.slides : []
    };

    const totalLatency = Date.now() - startTime;
    return {
      json: finalDeck,
      latencyMs: totalLatency,
      modelUsed,
      provider: providerUsed
    };
  }

  getStatus() {
    const groqReport = this.groqKeys.map((k, i) => ({
      index: i + 1,
      masked: this.maskKey(k),
      status: this.isKeyCoolingDown(k) ? 'COOLDOWN' : 'ACTIVE',
      successes: this.keyHealth.get(k)?.successes || 0,
      errors: this.keyHealth.get(k)?.errors || 0
    }));

    const nvidiaReport = this.nvidiaKeys.map((k, i) => ({
      index: i + 1,
      masked: this.maskKey(k),
      status: this.isKeyCoolingDown(k) ? 'COOLDOWN' : 'ACTIVE',
      successes: this.keyHealth.get(k)?.successes || 0,
      errors: this.keyHealth.get(k)?.errors || 0
    }));

    return {
      activeProvider: this.activeProvider.toUpperCase(),
      totalGroqKeys: this.groqKeys.length,
      totalNvidiaKeys: this.nvidiaKeys.length,
      groqPrimaryModel: config.groqArtifactPrimary,
      nvidiaPrimaryModel: config.nvidiaArtifactPrimary,
      groqKeys: groqReport,
      nvidiaKeys: nvidiaReport
    };
  }
}

export const aiProvider = new AIProviderManager();
export { AIProviderManager };
