import fs from 'fs';
import path from 'path';
import { config, getSystemPrompt } from '../../config.js';
import { aiProvider } from '../../ai/provider.js';
import { logger } from '../../utils/logger.js';
import { DocumentSchema } from './schema.js';
import { PDFRenderer } from './renderer.js';

function getPdfInstructions() {
  try {
    const filePath = path.resolve(process.cwd(), 'src/skills/pdf/pdf.md');
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (err) {
    logger.warn(`Could not read pdf.md: ${err.message}`);
  }
  return "You are an expert technical author. Generate a rich, structured JSON document for the requested topic.";
}

export class PDFGenerator {
  /**
   * Generates a complete PDF document from user instructions and context.
   * Combines system.md + pdf.md + user prompt + quoted text, calls AI, validates schema, and renders PDF buffer.
   */
  static async generate(context) {
    const { prompt = '', quotedText = '', isOwner = false, senderJid = '' } = context;
    const startTime = Date.now();

    const systemPrompt = getSystemPrompt();
    const pdfInstructions = getPdfInstructions();

    // Build the specialized AI system instruction
    const combinedSystemPrompt = `${systemPrompt}

---
# SPECIALIZED SKILL ACTIVATION: PDF DOCUMENT GENERATOR
${pdfInstructions}

[IMPORTANT OUTPUT CONTRACT:
1. You MUST generate ONLY valid JSON representing the full document structure.
2. Do NOT output any conversational preamble, pleasantries, explanations, or notes outside the JSON.
3. If you use markdown code fences, use \`\`\`json ... \`\`\`.]`;

    // Construct user request with quoted context if present
    let finalUserPrompt = prompt.trim();
    if (quotedText && quotedText.trim()) {
      finalUserPrompt = `[REFERENCE / QUOTED CONTENT TO CONVERT OR SUMMARIZE]:\n"""\n${quotedText.trim()}\n"""\n\n[USER INSTRUCTION]:\n${finalUserPrompt}`;
    }

    const messages = [
      { role: 'system', content: combinedSystemPrompt },
      { role: 'user', content: finalUserPrompt }
    ];

    logger.info(`[ROUTE] Method: SKILL_RESOLVER | Route: REASONING (SKILL: PDF) | Confidence: 1.00`);

    const activeProvider = aiProvider.getActiveProvider();
    const providerToUse = activeProvider === 'auto' ? (config.nvidiaKeys.length > 0 ? 'nvidia' : 'groq') : activeProvider;
    let finalProviderUsed = providerToUse;
    let actualModelUsed = '';
    let executionResult = null;

    // We use PDF model hierarchy for rich document synthesis
    const modelSelection = aiProvider.selectModel('pdf', providerToUse);
    logger.info(`[SELECTION] Route: PDF | Provider: ${providerToUse.toUpperCase()} | Primary: ${modelSelection.model} | Fallbacks: ${modelSelection.fallbackModels?.join(', ') || 'none'}`);

    try {
      if (providerToUse === 'nvidia') {
        executionResult = await aiProvider.executeNvidiaRequest({
          messages,
          primaryModel: modelSelection.model,
          fallbackModels: modelSelection.fallbackModels,
          isReasoning: true,
          maxTokens: 8192,
          responseFormat: { type: 'json_object' }
        });
      } else {
        executionResult = await aiProvider.executeGroqRequest({
          messages,
          primaryModel: modelSelection.model,
          fallbackModels: modelSelection.fallbackModels,
          isReasoning: true,
          maxTokens: 8192,
          reasoningEffort: 'medium',
          reasoningFormat: 'hidden',
          responseFormat: { type: 'json_object' }
        });
      }
      actualModelUsed = executionResult?.actualModel || modelSelection.model;
    } catch (err) {
      logger.warn(`[FAILOVER] ${providerToUse.toUpperCase()} primary provider exhausted (${err.message}). Attempting failover to alternate provider...`);
      const fallbackProvider = providerToUse === 'nvidia' ? 'groq' : 'nvidia';
      finalProviderUsed = fallbackProvider;
      const fallbackModel = aiProvider.selectModel('pdf', fallbackProvider);
      logger.info(`[SELECTION] Route: PDF | Provider: ${fallbackProvider.toUpperCase()} | Primary: ${fallbackModel.model} | Fallbacks: ${fallbackModel.fallbackModels?.join(', ') || 'none'}`);

      if (fallbackProvider === 'nvidia' && config.nvidiaKeys.length > 0) {
        executionResult = await aiProvider.executeNvidiaRequest({
          messages,
          primaryModel: fallbackModel.model,
          fallbackModels: fallbackModel.fallbackModels,
          isReasoning: true,
          maxTokens: 8192,
          responseFormat: { type: 'json_object' }
        });
      } else if (config.groqKeys.length > 0) {
        executionResult = await aiProvider.executeGroqRequest({
          messages,
          primaryModel: fallbackModel.model,
          fallbackModels: fallbackModel.fallbackModels,
          isReasoning: true,
          maxTokens: 8192,
          reasoningEffort: 'medium',
          reasoningFormat: 'hidden',
          responseFormat: { type: 'json_object' }
        });
      } else {
        throw err;
      }
      actualModelUsed = executionResult?.actualModel || fallbackModel.model;
    }

    const rawOutput = executionResult?.content || '';

    // Parse and sanitize the JSON structure
    const parsedData = this.extractJSON(rawOutput);
    const sanitizedDoc = DocumentSchema.validateAndSanitize(parsedData, prompt);

    logger.info(`[SKILL:PDF] Document structured: "${sanitizedDoc.title}" (${sanitizedDoc.sections.length} sections, Theme: ${sanitizedDoc.themeColor})`);

    // Render into vector PDF Buffer via PDFKit
    const pdfBuffer = await PDFRenderer.render(sanitizedDoc);
    const durationMs = Date.now() - startTime;

    const safeFilename = this.generateFilename(sanitizedDoc.title);
    const pageMatches = pdfBuffer.toString('binary').match(/\/Type\s*\/Page\b/g);
    const totalPages = pageMatches ? pageMatches.length : 1;

    logger.info(`[OUTPUT] Status: SUCCESS | Provider: ${finalProviderUsed.toUpperCase()} | Model: ${actualModelUsed} | Latency: ${durationMs}ms | Document: "${safeFilename}" (${(pdfBuffer.length / 1024).toFixed(1)} KB, ${totalPages} page${totalPages === 1 ? '' : 's'})`);

    return {
      success: true,
      buffer: pdfBuffer,
      filename: safeFilename,
      title: sanitizedDoc.title,
      category: sanitizedDoc.category,
      documentType: sanitizedDoc.documentType,
      caption: `📄 *${sanitizedDoc.title}*${sanitizedDoc.subtitle ? `\n_${sanitizedDoc.subtitle}_` : ''}`
    };
  }

  /**
   * Robustly extracts and auto-repairs JSON objects from raw AI text output.
   * Handles truncated responses, unclosed braces, invalid Windows path escapes,
   * markdown code fences, and malformed strings.
   */
  static extractJSON(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    let clean = rawText.trim();
    // 1. Strip reasoning tags if present
    clean = clean.replace(/<(think|thought|reasoning|reflection)>[\s\S]*?<\/\1>/gi, '').trim();

    // 2. Strip code fences if present
    let candidate = clean
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // 3. Find opening JSON object brace {
    const firstBrace = candidate.indexOf('{');
    if (firstBrace !== -1) {
      candidate = candidate.substring(firstBrace);
    }

    // 4. Attempt full repair and parse
    const parsed = this.repairAndParseJSON(candidate);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }

    // 5. Fallback: return raw text for schema fallback parsing
    return candidate || clean;
  }

  /**
   * Repairs and parses malformed or truncated JSON strings.
   */
  static repairAndParseJSON(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') return null;

    let text = jsonString.trim();

    // Step A: Replace Unicode smart quotes
    text = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

    // Attempt direct parse first
    try {
      return JSON.parse(text);
    } catch (e) {}

    // Step B: Sanitize invalid escapes and unescaped newlines/control characters inside strings
    let sanitized = '';
    let inStr = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === '\\') {
          const next = text[i + 1];
          if (next && '\"\\/bfnrt'.includes(next)) {
            sanitized += c + next;
            i++;
          } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.substring(i + 2, i + 6))) {
            sanitized += text.substring(i, i + 6);
            i += 5;
          } else {
            // Invalid escape like \S or trailing backslash -> double it
            sanitized += '\\\\';
          }
        } else if (c === '"') {
          inStr = false;
          sanitized += c;
        } else if (c === '\n') {
          sanitized += '\\n';
        } else if (c === '\r') {
          sanitized += '\\r';
        } else if (c === '\t') {
          sanitized += '\\t';
        } else {
          sanitized += c;
        }
      } else {
        if (c === '"') {
          inStr = true;
          sanitized += c;
        } else {
          sanitized += c;
        }
      }
    }

    try {
      return JSON.parse(sanitized);
    } catch (e) {}

    // Step C: Auto-close open strings and unclosed brackets/braces
    let inString = false;
    let isEscaped = false;
    const stack = [];

    for (let i = 0; i < sanitized.length; i++) {
      const char = sanitized[i];
      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '{' || char === '[') {
          stack.push(char);
        } else if (char === '}') {
          if (stack.length > 0 && stack[stack.length - 1] === '{') {
            stack.pop();
          }
        } else if (char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === '[') {
            stack.pop();
          }
        }
      }
    }

    let repaired = sanitized;
    if (inString) {
      repaired += '"';
    }

    // Strip trailing commas before closing brackets/braces
    repaired = repaired.replace(/,\s*$/, '').replace(/,\s*([\]}])/g, '$1');

    // Close remaining open brackets and braces in reverse order
    while (stack.length > 0) {
      const open = stack.pop();
      if (open === '{') repaired += '}';
      else if (open === '[') repaired += ']';
    }

    // Clean any trailing commas created before added brackets
    repaired = repaired.replace(/,\s*([\]}])/g, '$1');

    try {
      return JSON.parse(repaired);
    } catch (e) {}

    // Step D: Lexical fallback parser for corrupt/truncated JSON
    return this.extractFromPartialJSON(sanitized);
  }

  /**
   * Lexical fallback parser for heavily truncated or corrupt JSON.
   * Extracts sections, headings, paragraphs, and tables using regex patterns.
   */
  static extractFromPartialJSON(raw) {
    try {
      const doc = {
        documentType: 'document',
        themeColor: 'editorial_clean',
        title: '',
        subtitle: '',
        author: '',
        date: '',
        category: '',
        executiveSummary: '',
        sections: [],
        keyTakeaways: [],
        conclusion: ''
      };

      const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/i);
      if (titleMatch) doc.title = titleMatch[1];

      const typeMatch = raw.match(/"documentType"\s*:\s*"([^"]+)"/i);
      if (typeMatch) doc.documentType = typeMatch[1];

      const themeMatch = raw.match(/"themeColor"\s*:\s*"([^"]+)"/i);
      if (themeMatch) doc.themeColor = themeMatch[1];

      const subtitleMatch = raw.match(/"subtitle"\s*:\s*"([^"]+)"/i);
      if (subtitleMatch) doc.subtitle = subtitleMatch[1];

      const summaryMatch = raw.match(/"executiveSummary"\s*:\s*"([^"]+)"/i);
      if (summaryMatch) doc.executiveSummary = summaryMatch[1];

      // Extract section objects
      const sectionRegex = /\{\s*"heading"\s*:\s*"([^"]+)"(?:[\s\S]*?"subheading"\s*:\s*"([^"]*)")?([\s\S]*?)(?=\}\s*,\s*\{\s*"heading"|\}\s*\]|$)/gi;
      let secMatch;
      while ((secMatch = sectionRegex.exec(raw)) !== null) {
        const heading = secMatch[1];
        const subheading = secMatch[2] || '';
        const bodyBlock = secMatch[3] || '';

        const paragraphs = [];
        const pRegex = /"paragraphs"\s*:\s*\[([\s\S]*?)\]/i;
        const pMatch = bodyBlock.match(pRegex);
        if (pMatch) {
          const strRegex = /"([^"]+)"/g;
          let sm;
          while ((sm = strRegex.exec(pMatch[1])) !== null) {
            paragraphs.push(sm[1]);
          }
        }

        const bulletPoints = [];
        const bRegex = /"bulletPoints"\s*:\s*\[([\s\S]*?)\]/i;
        const bMatch = bodyBlock.match(bRegex);
        if (bMatch) {
          const strRegex = /"([^"]+)"/g;
          let sm;
          while ((sm = strRegex.exec(bMatch[1])) !== null) {
            bulletPoints.push(sm[1]);
          }
        }

        doc.sections.push({
          heading,
          subheading,
          paragraphs: paragraphs.length > 0 ? paragraphs : ['Detailed technical analysis and operational guidelines.'],
          bulletPoints
        });
      }

      if (doc.title || doc.sections.length > 0) {
        return doc;
      }
    } catch (err) {}
    return null;
  }

  /**
   * Generates clean, human-readable file name from document title.
   */
  static generateFilename(title) {
    if (!title || typeof title !== 'string') return 'Document.pdf';
    const clean = title
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 45);
    return `${clean || 'Executive-Report'}.pdf`;
  }
}
