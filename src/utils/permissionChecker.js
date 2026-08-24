import { config } from '../config.js';

export default {
  unwrapMessage(rawMessage) {
    if (!rawMessage || !rawMessage.message) return null;
    let message = rawMessage.message;

    if (message.ephemeralMessage) message = message.ephemeralMessage.message;
    if (message.viewOnceMessage) message = message.viewOnceMessage.message;
    if (message.viewOnceMessageV2) message = message.viewOnceMessageV2.message;
    if (message.documentWithCaptionMessage) message = message.documentWithCaptionMessage.message;
    if (message.editedMessage) message = message.editedMessage.message?.protocolMessage?.editedMessage || message;

    return message;
  },

  extractMessageText(unwrappedMessage) {
    if (!unwrappedMessage) return '';
    return (
      unwrappedMessage.conversation ||
      unwrappedMessage.extendedTextMessage?.text ||
      unwrappedMessage.imageMessage?.caption ||
      unwrappedMessage.videoMessage?.caption ||
      unwrappedMessage.documentMessage?.caption ||
      unwrappedMessage.buttonsResponseMessage?.selectedButtonId ||
      unwrappedMessage.listResponseMessage?.singleSelectReply?.selectedRowId ||
      ''
    );
  },

  normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return '';
    return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  },

  isBroadcastOrNewsletter(jid) {
    return jid && (jid.endsWith('@newsletter') || jid.endsWith('@broadcast'));
  },

  isGroup(jid) {
    return jid && jid.endsWith('@g.us');
  },

  extractQuotedText(rawMessage) {
    const unwrapped = this.unwrapMessage(rawMessage);
    if (!unwrapped) return '';
    const contextInfo =
      unwrapped.extendedTextMessage?.contextInfo ||
      unwrapped.imageMessage?.contextInfo ||
      unwrapped.videoMessage?.contextInfo ||
      unwrapped.audioMessage?.contextInfo ||
      unwrapped.documentMessage?.contextInfo;

    if (!contextInfo || !contextInfo.quotedMessage) return '';
    const quotedUnwrapped = this.unwrapMessage({ message: contextInfo.quotedMessage });
    return this.extractMessageText(quotedUnwrapped);
  },

  async hasGroupWritePermission() {
    return true;
  }
};
