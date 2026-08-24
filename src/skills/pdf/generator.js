import { config } from '../../config.js';
import { aiProvider } from '../../ai/provider.js';
import { logger } from '../../utils/logger.js';
import { PDFRenderer } from './renderer.js';

function buildPdfSystemPrompt(isOwner = false) {
  const maxSections = isOwner ? config.ownerMaxPages : config.normalUserMaxPages;
  return `You are a Senior Publication Architect. Convert the user's request into a single strictly valid JSON object describing a beautifully formatted, multi-page visual PDF document.

OUTPUT RULES:
1. Output ONLY a single raw valid JSON object. No conversational text, no markdown code blocks.
2. Structure must include: "title", "documentType" ("document"|"guide"|"report"|"summary"), "themeColor" ("editorial_clean"|"retro_pixel"|"pastel_chic"|"playful_pop"|"aurora_neon"), and "sections" (array).
3. Maximum sections allowed for this document: ${maxSections}.
4. Components allowed in subsections:
   - "paragraphs": array of rich text strings
   - "cards": array of { "title", "content", "variant": "info"|"warning"|"success"|"quote"|"neutral" }
   - "kpis": array of { "value", "label", "change"?: string }
   - "tables": array of { "headers": string[], "rows": string[][] }
   - "codeSnippets": array of { "language", "code" }
5. Never output empty sections or placeholder text ("Lorem ipsum", "TODO"). Provide genuine, insightful, and comprehensive content.`;
}

export class PDFGenerator {
  static async generate(context) {
    const { prompt = '', quotedText = '', isOwner = false } = context;
    const startTime = Date.now();

    const systemPrompt = buildPdfSystemPrompt(isOwner);
    let finalUserPrompt = prompt.trim();
    if (quotedText && quotedText.trim()) {
      finalUserPrompt = `[REFERENCE CONTENT / SOURCE MATERIAL]:\n"""\n${quotedText.trim()}\n"""\n\n[USER INSTRUCTION / TOPIC]:\n${finalUserPrompt || 'Create a comprehensive structured document based on this reference.'}`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: finalUserPrompt }
    ];

    logger.info(`[PDF:PARALLEL] Dispatching parallel artifact request across keys | Topic: "${finalUserPrompt.substring(0, 80)}" | Tier: ${isOwner ? 'OWNER (Unlimited)' : 'STANDARD (Max 4 Pages)'}`);

    const result = await aiProvider.executeParallelArtifactRequest({
      messages,
      type: 'pdf',
      maxTokens: config.artifactMaxTokens || 3500
    });

    const docJson = result.json;
    if (!docJson.title || typeof docJson.title !== 'string') {
      docJson.title = prompt.slice(0, 40) || 'Document';
    }

    // Render the vector PDF via PDFRenderer
    const renderResult = await PDFRenderer.render(docJson);
    const totalLatency = Date.now() - startTime;

    const safeTitle = (docJson.title || 'Document')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);

    return {
      buffer: renderResult.buffer,
      filename: `${safeTitle}.pdf`,
      title: docJson.title,
      caption: `📄 Generated Document: *${docJson.title}*\n⚡ _Synthesized in ${(totalLatency / 1000).toFixed(1)}s via ${result.modelUsed}_`,
      pageCount: renderResult.pageCount || 1,
      latencyMs: totalLatency,
      modelUsed: result.modelUsed,
      keyUsed: result.keyUsed
    };
  }
}
