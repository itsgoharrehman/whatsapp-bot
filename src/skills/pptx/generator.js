import { aiProvider } from '../../ai/provider.js';
import { logger } from '../../utils/logger.js';
import { PPTXRenderer } from './renderer.js';

export class PPTXGenerator {
  static async generate(context) {
    const { prompt = '', quotedText = '', isOwner = false } = context;
    const startTime = Date.now();

    logger.info(`[PPTX:DISTRIBUTED] Launching multi-key distributed generation | Topic: "${prompt.substring(0, 80)}" | Tier: ${isOwner ? 'OWNER (Unlimited)' : 'STANDARD (Max 10 Slides)'}`);

    // Run distributed generation across multiple keys in parallel
    const result = await aiProvider.executeDistributedPptxGeneration({
      prompt,
      quotedText,
      isOwner
    });

    const presJson = result.json;
    if (!presJson.title || typeof presJson.title !== 'string') {
      presJson.title = prompt.slice(0, 40) || 'Presentation';
    }

    // Render native PowerPoint presentation via PPTXRenderer
    const renderedBuffer = await PPTXRenderer.render(presJson);
    const totalLatency = Date.now() - startTime;

    const safeTitle = (presJson.title || 'Presentation')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);

    const validBuffer = Buffer.isBuffer(renderedBuffer) ? renderedBuffer : (renderedBuffer?.buffer || Buffer.from(renderedBuffer));

    logger.info(`[PPTX:SUCCESS] Generated "${presJson.title}" buffer size: ${validBuffer.length} bytes`);

    return {
      buffer: validBuffer,
      filename: `${safeTitle}.pptx`,
      title: presJson.title,
      caption: `📊 Generated Presentation: *${presJson.title}*\n⚡ _Synthesized in ${(totalLatency / 1000).toFixed(1)}s across parallel keys [${result.keyUsed}]_`,
      mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      slideCount: presJson.slides?.length || 1,
      latencyMs: totalLatency,
      modelUsed: result.modelUsed,
      keyUsed: result.keyUsed
    };
  }
}
