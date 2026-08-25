import { aiProvider } from '../../ai/provider.js';
import { logger } from '../../utils/logger.js';
import { PDFRenderer } from './renderer.js';

export class PDFGenerator {
  static async generate(context) {
    const { prompt = '', quotedText = '', isOwner = false } = context;
    const startTime = Date.now();

    const result = await aiProvider.executeDistributedPdfGeneration({
      prompt,
      quotedText,
      isOwner
    });

    const docJson = result.json;
    if (!docJson.title || typeof docJson.title !== 'string') {
      docJson.title = prompt.slice(0, 40) || 'Document';
    }

    const renderedBuffer = await PDFRenderer.render(docJson);
    const totalLatency = Date.now() - startTime;

    const safeTitle = (docJson.title || 'Document')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);

    const validBuffer = Buffer.isBuffer(renderedBuffer) ? renderedBuffer : (renderedBuffer?.buffer || Buffer.from(renderedBuffer));
    logger.info(`[PDF] "${docJson.title}" (${docJson.themeColor || 'editorial_clean'}) compiled in ${(totalLatency / 1000).toFixed(1)}s`);

    return {
      buffer: validBuffer,
      filename: `${safeTitle}.pdf`,
      title: docJson.title,
      caption: `*${docJson.title}*\nGenerated in ${(totalLatency / 1000).toFixed(1)}s`,
      pageCount: docJson.sections?.length || 1,
      latencyMs: totalLatency,
      modelUsed: result.modelUsed,
      keyUsed: result.provider || ''
    };
  }
}
