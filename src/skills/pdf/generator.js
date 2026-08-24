import { aiProvider } from '../../ai/provider.js';
import { logger } from '../../utils/logger.js';
import { PDFRenderer } from './renderer.js';

export class PDFGenerator {
  static async generate(context) {
    const { prompt = '', quotedText = '', isOwner = false } = context;
    const startTime = Date.now();

    logger.info(`[PDF:DISTRIBUTED] Launching multi-key distributed generation | Topic: "${prompt.substring(0, 80)}" | Tier: ${isOwner ? 'OWNER (Unlimited)' : 'STANDARD (Max 4 Pages)'}`);

    // Run distributed generation across multiple keys in parallel
    const result = await aiProvider.executeDistributedPdfGeneration({
      prompt,
      quotedText,
      isOwner
    });

    const docJson = result.json;
    if (!docJson.title || typeof docJson.title !== 'string') {
      docJson.title = prompt.slice(0, 40) || 'Document';
    }

    // Render the vector PDF via PDFRenderer
    const renderedBuffer = await PDFRenderer.render(docJson);
    const totalLatency = Date.now() - startTime;

    const safeTitle = (docJson.title || 'Document')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);

    const validBuffer = Buffer.isBuffer(renderedBuffer) ? renderedBuffer : (renderedBuffer?.buffer || Buffer.from(renderedBuffer));

    logger.info(`[PDF:SUCCESS] Generated "${docJson.title}" buffer size: ${validBuffer.length} bytes`);

    return {
      buffer: validBuffer,
      filename: `${safeTitle}.pdf`,
      title: docJson.title,
      caption: `📄 Generated Document: *${docJson.title}*\n⚡ _Synthesized in ${(totalLatency / 1000).toFixed(1)}s across parallel keys [${result.keyUsed}]_`,
      pageCount: docJson.sections?.length || 1,
      latencyMs: totalLatency,
      modelUsed: result.modelUsed,
      keyUsed: result.keyUsed
    };
  }
}
