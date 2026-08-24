import { skillLoader } from './loader.js';
import { config } from '../config.js';

export class SkillResolver {
  /**
   * Parses an incoming message to check if it matches a skill trigger like `@mark(pdf) [prompt]`.
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
      raw.startsWith('[Sent Document:')
    ) {
      return { isSkill: false, skillName: null, skill: null, prompt: raw, rawMessage: raw };
    }

    const botNum = options.botPhoneNum || (config.ownerNumber ? config.ownerNumber.replace(/[^0-9]/g, '') : '');

    // Pattern 1: @mark(<skill>) <prompt> or @<botNum>(<skill>) <prompt> or @zuck(<skill>) <prompt>
    // Allows optional space between @mark and (skill), optional colon/dash after parenthesis
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

    // Pattern 2: /skill <skill_name> <prompt> or /<skill_name> (if registered)
    const slashMatch = raw.match(/^\/skill\s+([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/i);
    if (slashMatch) {
      const skillName = slashMatch[1].trim().toLowerCase();
      const prompt = (slashMatch[2] || '').trim();
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
