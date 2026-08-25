import { PPTXGenerator } from './generator.js';

export const pptxSkill = {
  name: 'pptx',
  aliases: ['ppt', 'presentation', 'slides', 'powerpoint', 'deck'],
  description: 'Generates publication-grade, professionally designed PowerPoint (.pptx) presentations with native charts, tables, KPIs, diagrams, and cards from prompts or quoted text',
  usage: '/ppt <your prompt or topic>',

  /**
   * Executes the PowerPoint generation skill.
   * @param {Object} context
   * @param {string} context.prompt - User input/prompt
   * @param {string} [context.quotedText] - Quoted WhatsApp context
   * @param {string} [context.senderJid] - Sender JID
   * @param {boolean} [context.isOwner] - Whether sender is verified owner
   * @param {string} [context.chatJid] - Target chat JID
   * @returns {Promise<Object>} Standard skill dispatch object
   */
  async execute(context) {
    const result = await PPTXGenerator.generate(context);
    return {
      type: 'document',
      buffer: result.buffer,
      content: result.buffer,
      filename: result.filename,
      mimetype: result.mimetype || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      caption: result.caption,
      title: result.title,
      slideCount: result.slideCount,
      latencyMs: result.latencyMs,
      modelUsed: result.modelUsed,
      keyUsed: result.keyUsed
    };
  }
};

export default pptxSkill;
