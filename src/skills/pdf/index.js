import { PDFGenerator } from './generator.js';

export const pdfSkill = {
  name: 'pdf',
  aliases: ['document', 'doc', 'report', 'guide'],
  description: 'Generates publication-grade, professionally designed PDF documents from prompts or quoted text',
  usage: '@mark(pdf) <your prompt or topic>',

  /**
   * Executes the PDF generation skill.
   * @param {Object} context
   * @param {string} context.prompt - The user's input/prompt
   * @param {string} [context.quotedText] - Any quoted or replied-to message text
   * @param {string} [context.senderJid] - JID of the sender
   * @param {boolean} [context.isOwner] - Whether sender is verified owner
   * @param {string} [context.chatJid] - Target chat JID
   * @returns {Promise<Object>} Standard skill dispatch object
   */
  async execute(context) {
    const result = await PDFGenerator.generate(context);
    return {
      type: 'document',
      content: result.buffer,
      filename: result.filename,
      mimetype: 'application/pdf',
      caption: result.caption,
      title: result.title,
      documentType: result.documentType
    };
  }
};

export default pdfSkill;
