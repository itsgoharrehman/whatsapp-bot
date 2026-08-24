import { config } from '../../config.js';
import { aiProvider } from '../../ai/provider.js';
import { logger } from '../../utils/logger.js';
import { PPTXRenderer } from './renderer.js';

function buildPptxSystemPrompt(isOwner = false) {
  const maxSlides = isOwner ? config.ownerMaxSlides : config.normalUserMaxSlides;
  return `You are a Principal Executive Presentation Designer. Convert the user's topic into a single strictly valid JSON object describing an impactful, publication-grade PowerPoint deck.

OUTPUT RULES:
1. Output ONLY a single raw valid JSON object. No conversational text, no markdown code fences.
2. Structure must include: "title", "theme" ("ocean_gradient"|"dark_matter"|"emerald_growth"|"sunset_coral"|"monochrome_bold"|"corporate_navy"), and "slides" (array).
3. Maximum slides allowed for this presentation: ${maxSlides}.
4. Slide structures allowed:
   - "title" slide: { "type": "title", "title": string, "subtitle"?: string }
   - "bullet_list" slide: { "type": "bullet_list", "title": string, "items": string[] }
   - "kpi_grid" slide: { "type": "kpi_grid", "title": string, "kpis": [{ "value": string, "label": string, "change"?: string }] }
   - "cards" slide: { "type": "cards", "title": string, "cards": [{ "title": string, "description": string, "badge"?: string }] }
   - "table" slide: { "type": "table", "title": string, "headers": string[], "rows": string[][] }
   - "comparison" slide: { "type": "comparison", "title": string, "left": { "title": string, "points": string[] }, "right": { "title": string, "points": string[] } }
5. Every slide must have rich, insightful, professional content. Never output placeholders or empty text.`;
}

export class PPTXGenerator {
  static async generate(context) {
    const { prompt = '', quotedText = '', isOwner = false } = context;
    const startTime = Date.now();

    const systemPrompt = buildPptxSystemPrompt(isOwner);
    let finalUserPrompt = prompt.trim();
    if (quotedText && quotedText.trim()) {
      finalUserPrompt = `[SOURCE CONTENT TO CONVERT INTO PRESENTATION SLIDES]:\n"""\n${quotedText.trim()}\n"""\n\n[USER TOPIC / INSTRUCTIONS]:\n${finalUserPrompt || 'Create a structured presentation deck summarizing this material.'}`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: finalUserPrompt }
    ];

    logger.info(`[PPTX:PARALLEL] Dispatching parallel presentation request across keys | Topic: "${finalUserPrompt.substring(0, 80)}" | Tier: ${isOwner ? 'OWNER (Unlimited)' : 'STANDARD (Max 10 Slides)'}`);

    const result = await aiProvider.executeParallelArtifactRequest({
      messages,
      type: 'pptx',
      maxTokens: config.artifactMaxTokens || 3500
    });

    const presJson = result.json;
    if (!presJson.title || typeof presJson.title !== 'string') {
      presJson.title = prompt.slice(0, 40) || 'Presentation';
    }

    // Render native PowerPoint buffer via PPTXRenderer
    const renderResult = await PPTXRenderer.render(presJson);
    const totalLatency = Date.now() - startTime;

    const safeTitle = (presJson.title || 'Presentation')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);

    return {
      buffer: renderResult.buffer,
      filename: `${safeTitle}.pptx`,
      title: presJson.title,
      caption: `📊 Generated Presentation: *${presJson.title}*\n⚡ _Synthesized in ${(totalLatency / 1000).toFixed(1)}s via ${result.modelUsed}_`,
      mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      slideCount: renderResult.slideCount || presJson.slides?.length || 1,
      latencyMs: totalLatency,
      modelUsed: result.modelUsed,
      keyUsed: result.keyUsed
    };
  }
}
