import { skillLoader } from './loader.js';
import { config } from '../config.js';

export class SkillResolver {
  /**
   * Parses an incoming message to check if it matches a skill trigger like `/pdf [prompt]`, `/ppt [prompt]`, or `@mark(pdf) [prompt]`.
   * @param {string} messageText Raw incoming message text
   * @param {Object} [options] Context options
   * @param {string} [options.botPhoneNum] Normalized bot phone number
   * @returns {{ isSkill: boolean, skillName: string|null, skill: Object|null, prompt: string, rawMessage: string }}
   */
  static resolve(messageText, options = {}) {
    if (!messageText || typeof messageText !== 'string') {
      return { isSkill: false, skillName: null, skill: null, prompt: '', rawMessage: '' };
    }

    const raw = messageText.trim();

    // Guard against bot generated captions or status messages
    if (
      raw.startsWith('*Control Panel*') ||
      raw.startsWith('📄 Generated Document:') ||
      raw.startsWith('📊 Generated Presentation:') ||
      raw.startsWith('[Sent Document:') ||
      raw.startsWith('*Mark Zuckerberg*') ||
      raw.startsWith('Sorry, there was an issue') ||
      raw.startsWith("Sorry, WhatsApp couldn't download")
    ) {
      return { isSkill: false, skillName: null, skill: null, prompt: raw, rawMessage: raw };
    }

    const botNum = options.botPhoneNum || (config.ownerNumber ? config.ownerNumber.replace(/[^0-9]/g, '') : '');

    // Pattern 1: Direct Slash Commands: /pdf <prompt>, /ppt <prompt>, /pptx <prompt>, /doc <prompt>
    const directSlashMatch = raw.match(/^\/([a-zA-Z0-9_-]+)(?::|\s+)?([\s\S]*)$/i);
    if (directSlashMatch) {
      const cmdName = directSlashMatch[1].trim().toLowerCase();
      const prompt = (directSlashMatch[2] || '').trim();

      // Check if command matches a registered skill or alias (e.g. pdf, ppt, pptx, doc)
      let skill = skillLoader.getSkill(cmdName);
      if (!skill && cmdName === 'skill') {
        const skillArgs = prompt.split(/\s+/);
        const targetSkill = skillArgs[0]?.toLowerCase();
        skill = skillLoader.getSkill(targetSkill);
        if (skill) {
          return {
            isSkill: true,
            skillName: skill.name,
            skill,
            prompt: prompt.substring(targetSkill.length).trim(),
            rawMessage: raw
          };
        }
      }

      if (skill) {
        return {
          isSkill: true,
          skillName: skill.name,
          skill,
          prompt,
          rawMessage: raw
        };
      }
    }

    // Pattern 2: Mention with Slash Command: @mark /pdf <prompt>, mark /ppt <prompt>
    const mentionSlashRegex = new RegExp(
      `^(?:@mark|@zuck|mark|zuck|@${botNum})\\s+\\/([a-zA-Z0-9_-]+)(?::|\\s+)?([\\s\\S]*)$`,
      'i'
    );
    const mentionSlashMatch = raw.match(mentionSlashRegex);
    if (mentionSlashMatch) {
      const cmdName = mentionSlashMatch[1].trim().toLowerCase();
      const prompt = (mentionSlashMatch[2] || '').trim();
      const skill = skillLoader.getSkill(cmdName);
      if (skill) {
        return {
          isSkill: true,
          skillName: skill.name,
          skill,
          prompt,
          rawMessage: raw
        };
      }
    }

    // Pattern 3: Parentheses syntax: @mark(pdf) <prompt>, @mark(ppt) <prompt>
    const patternParentheses = new RegExp(
      `^(?:@mark|@zuck|mark|zuck|@${botNum})\\s*\\(\\s*([a-zA-Z0-9_-]+)\\s*\\)\\s*[:,-]?\\s*([\\s\\S]*)$`,
      'i'
    );
    const matchParentheses = raw.match(patternParentheses);
    if (matchParentheses) {
      const skillName = matchParentheses[1].trim().toLowerCase();
      const prompt = (matchParentheses[2] || '').trim();
      const skill = skillLoader.getSkill(skillName);

      if (skill) {
        return {
          isSkill: true,
          skillName: skill.name,
          skill,
          prompt,
          rawMessage: raw
        };
      }
    }

    return {
      isSkill: false,
      skillName: null,
      skill: null,
      prompt: raw,
      rawMessage: raw
    };
  }
}

export const skillResolver = SkillResolver;
