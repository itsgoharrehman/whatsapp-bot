import fs from 'fs';
import path from 'path';
import { config, getSystemPrompt } from '../../config.js';
import { aiProvider } from '../../ai/provider.js';
import { logger } from '../../utils/logger.js';
import { PresentationSchema } from './schema.js';
import { PPTXRenderer } from './renderer.js';

let cachedPptxInstructions = null;

function getPptxInstructions() {
  if (cachedPptxInstructions) return cachedPptxInstructions;
  try {
    const filePath = path.resolve(process.cwd(), 'src/skills/pptx/pptx.md');
    if (fs.existsSync(filePath)) {
      cachedPptxInstructions = fs.readFileSync(filePath, 'utf8');
      return cachedPptxInstructions;
    }
  } catch (err) {
    logger.warn(`Could not read pptx.md: ${err.message}`);
  }
  return "You are an expert presentation designer. Generate a rich, structured JSON presentation specification for the requested topic.";
}

export class PPTXGenerator {
  /**
   * Generates a complete PowerPoint (.pptx) presentation from user instructions and context.
   * @param {Object} context
   * @param {string} context.prompt - User input/prompt
   * @param {string} [context.quotedText] - Context from quoted WhatsApp message
   * @returns {Promise<Object>} Result containing buffer, filename, mimetype, caption, and title
   */
  static async generate(context) {
    const { prompt = '', quotedText = '', isOwner = false, senderJid = '' } = context;
    const startTime = Date.now();

    const systemPrompt = getSystemPrompt();
    const pptxInstructions = getPptxInstructions();

    // Build the specialized AI system instruction
    const combinedSystemPrompt = `${systemPrompt}

---
# SPECIALIZED SKILL ACTIVATION: PPTX PRESENTATION DESIGNER
${pptxInstructions}

[IMPORTANT OUTPUT CONTRACT:
1. You MUST generate ONLY valid JSON representing the presentation specification.
2. Do NOT output any conversational preamble, pleasantries, explanations, or notes outside the JSON.
3. If you use markdown code fences, use \`\`\`json ... \`\`\`.]`;

    // Construct user request with quoted context if present
    let finalUserPrompt = prompt.trim();
    if (quotedText && quotedText.trim()) {
      finalUserPrompt = `[REFERENCE / QUOTED CONTENT TO CONVERT INTO SLIDES]:\n"""\n${quotedText.trim()}\n"""\n\n[USER INSTRUCTION]:\n${finalUserPrompt}`;
    }

    const messages = [
      { role: 'system', content: combinedSystemPrompt },
      { role: 'user', content: finalUserPrompt }
    ];

    logger.info(`[ROUTE] Method: SKILL_RESOLVER | Route: REASONING (SKILL: PPTX) | Confidence: 1.00`);

    const activeProvider = aiProvider.getActiveProvider();
    const providerToUse = activeProvider === 'auto' ? (config.nvidiaKeys.length > 0 ? 'nvidia' : 'groq') : activeProvider;
    let finalProviderUsed = providerToUse;
    let actualModelUsed = '';
    let executionResult = null;

    // Use dedicated PPTX model hierarchy for presentation synthesis
    const modelSelection = aiProvider.selectModel('pptx', providerToUse);
    logger.info(`[SELECTION] Route: PPTX | Provider: ${providerToUse.toUpperCase()} | Primary: ${modelSelection.model} | Fallbacks: ${modelSelection.fallbackModels?.join(', ') || 'none'}`);

    try {
      if (providerToUse === 'nvidia') {
        executionResult = await aiProvider.executeNvidiaRequest({
          messages,
          primaryModel: modelSelection.model,
          fallbackModels: modelSelection.fallbackModels,
          isReasoning: true,
          maxTokens: 4096,
          responseFormat: { type: 'json_object' }
        });
      } else {
        executionResult = await aiProvider.executeGroqRequest({
          messages,
          primaryModel: modelSelection.model,
          fallbackModels: modelSelection.fallbackModels,
          isReasoning: true,
          maxTokens: 4096,
          reasoningEffort: 'medium',
          reasoningFormat: 'hidden',
          responseFormat: { type: 'json_object' }
        });
      }
      actualModelUsed = executionResult?.actualModel || modelSelection.model;
    } catch (err) {
      logger.warn(`[FAILOVER] ${providerToUse.toUpperCase()} primary provider failed for PPTX (${err.message}). Attempting failover...`);
      const fallbackProvider = providerToUse === 'nvidia' ? 'groq' : 'nvidia';
      finalProviderUsed = fallbackProvider;
      const fallbackModel = aiProvider.selectModel('pptx', fallbackProvider);
      logger.info(`[SELECTION] Route: PPTX | Provider: ${fallbackProvider.toUpperCase()} | Primary: ${fallbackModel.model} | Fallbacks: ${fallbackModel.fallbackModels?.join(', ') || 'none'}`);

      if (fallbackProvider === 'nvidia') {
        executionResult = await aiProvider.executeNvidiaRequest({
          messages,
          primaryModel: fallbackModel.model,
          fallbackModels: fallbackModel.fallbackModels,
          isReasoning: true,
          maxTokens: 4096,
          responseFormat: { type: 'json_object' }
        });
      } else {
        executionResult = await aiProvider.executeGroqRequest({
          messages,
          primaryModel: fallbackModel.model,
          fallbackModels: fallbackModel.fallbackModels,
          isReasoning: true,
          maxTokens: 4096,
          reasoningEffort: 'medium',
          reasoningFormat: 'hidden',
          responseFormat: { type: 'json_object' }
        });
      }
      actualModelUsed = executionResult?.actualModel || fallbackModel.model;
    }

    const rawResponse = executionResult?.content || '';

    // Parse and repair presentation JSON
    const parsedJSON = this.extractJSON(rawResponse, prompt);

    // Validate and sanitize specification
    const presentationSpec = PresentationSchema.validate(parsedJSON, prompt);

    // Render PowerPoint Buffer
    const pptxBuffer = await PPTXRenderer.render(presentationSpec);

    const safeTitle = (presentationSpec.title || 'presentation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 35) || 'presentation';

    const filename = `${safeTitle}.pptx`;
    const elapsed = Date.now() - startTime;
    const slideCount = presentationSpec.slides?.length || 0;

    logger.info(`[PPTX:COMPLETE] File: ${filename} | Slides: ${slideCount} | Model: ${actualModelUsed} | Provider: ${finalProviderUsed.toUpperCase()} | Time: ${elapsed}ms`);

    return {
      buffer: pptxBuffer,
      filename,
      mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      title: presentationSpec.title,
      slideCount,
      themeColor: presentationSpec.themeColor,
      caption: `📊 Generated Presentation: *${presentationSpec.title}*\n_${slideCount} slide${slideCount === 1 ? '' : 's'} • Theme: ${presentationSpec.themeColor}_`
    };
  }

  /**
   * Extracts and repairs JSON from LLM output.
   */
  static extractJSON(rawText, userPrompt = '') {
    if (!rawText || typeof rawText !== 'string') {
      return PresentationSchema.repairFromText('', userPrompt);
    }

    let cleaned = rawText.trim();

    // Strip Markdown code fences
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      cleaned = fenceMatch[1].trim();
    } else {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    }

    // Attempt direct parse
    try {
      return JSON.parse(cleaned);
    } catch (e1) {
      // Lexical repair
      const repaired = this.repairAndParseJSON(cleaned);
      if (repaired && typeof repaired === 'object') {
        return repaired;
      }
    }

    // Fallback to text repair
    return PresentationSchema.repairFromText(rawText, userPrompt);
  }

  /**
   * Robust lexical repair engine for partial / truncated JSON.
   */
  static repairAndParseJSON(str) {
    if (!str || typeof str !== 'string') return null;

    let s = str.trim();
    const firstBrace = s.indexOf('{');
    if (firstBrace === -1) return null;
    s = s.substring(firstBrace);

    // Fix unescaped backslashes
    s = s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

    // Remove trailing commas before } or ]
    s = s.replace(/,\s*([}\]])/g, '$1');

    try {
      return JSON.parse(s);
    } catch (_) {}

    // Complete truncated objects and arrays
    let inString = false;
    let escape = false;
    const stack = [];

    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
      }
    }

    if (inString) s += '"';

    s = s.replace(/,\s*$/, '');

    while (stack.length > 0) {
      s += stack.pop();
    }

    s = s.replace(/,\s*([}\]])/g, '$1');

    try {
      return JSON.parse(s);
    } catch (_) {
      return this.extractFromPartialJSON(str);
    }
  }

  /**
   * Heuristic fallback for heavily damaged JSON.
   */
  static extractFromPartialJSON(str) {
    try {
      const titleMatch = str.match(/"title"\s*:\s*"([^"]+)"/);
      const subtitleMatch = str.match(/"subtitle"\s*:\s*"([^"]+)"/);
      const themeMatch = str.match(/"themeColor"\s*:\s*"([^"]+)"/);

      return {
        title: titleMatch ? titleMatch[1] : 'Executive Presentation',
        subtitle: subtitleMatch ? subtitleMatch[1] : 'Strategic Analysis',
        themeColor: themeMatch ? themeMatch[1] : 'tech_indigo',
        slides: [
          {
            type: 'title',
            title: titleMatch ? titleMatch[1] : 'Executive Presentation',
            subtitle: subtitleMatch ? subtitleMatch[1] : 'Strategic Analysis'
          },
          {
            type: 'content',
            title: 'Overview',
            cards: [{ title: 'Key Analysis', description: 'Comprehensive presentation synthesis.' }]
          }
        ]
      };
    } catch (_) {
      return null;
    }
  }
}
