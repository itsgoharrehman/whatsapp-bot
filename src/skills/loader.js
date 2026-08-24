import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { pdfSkill } from './pdf/index.js';
import { pptxSkill } from './pptx/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SkillLoader {
  constructor() {
    this.skills = new Map();
    this.aliases = new Map();
    this.initialized = false;

    // Register built-in skills immediately
    this.registerSkill(pdfSkill);
    this.registerSkill(pptxSkill);
  }

  /**
   * Registers a skill in the internal registry.
   */
  registerSkill(skill) {
    if (!skill || !skill.name || typeof skill.execute !== 'function') {
      logger.warn('Attempted to register invalid skill object.');
      return false;
    }

    const normalizedName = skill.name.toLowerCase();
    this.skills.set(normalizedName, skill);
    this.aliases.set(normalizedName, normalizedName);

    if (Array.isArray(skill.aliases)) {
      skill.aliases.forEach(alias => {
        if (alias && typeof alias === 'string') {
          this.aliases.set(alias.toLowerCase(), normalizedName);
        }
      });
    }

    logger.info(`[SKILLS] Registered skill: '${normalizedName}' (Aliases: ${skill.aliases?.join(', ') || 'none'})`);
    return true;
  }

  /**
   * Retrieves a skill by name or alias (case-insensitive).
   */
  getSkill(nameOrAlias) {
    if (!nameOrAlias || typeof nameOrAlias !== 'string') return null;
    const cleanKey = nameOrAlias.trim().toLowerCase();
    const primaryName = this.aliases.get(cleanKey);
    if (!primaryName) return null;
    return this.skills.get(primaryName) || null;
  }

  /**
   * Checks if a skill exists by name or alias.
   */
  hasSkill(nameOrAlias) {
    return Boolean(this.getSkill(nameOrAlias));
  }

  /**
   * Lists all loaded skills with their details.
   */
  listSkills() {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      aliases: s.aliases || [],
      description: s.description || 'No description provided.',
      usage: s.usage || `@mark(${s.name}) <prompt>`
    }));
  }

  /**
   * Dynamically discovers and loads all skill folders in skills directory.
   */
  async loadAll() {
    if (this.initialized) return;
    try {
      const entries = fs.readdirSync(__dirname, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillIndexFile = path.join(__dirname, entry.name, 'index.js');
          if (fs.existsSync(skillIndexFile)) {
            try {
              const module = await import(`./${entry.name}/index.js`);
              const skill = module.default || module[entry.name + 'Skill'] || module.skill;
              if (skill) {
                this.registerSkill(skill);
              }
            } catch (importErr) {
              logger.warn(`Failed to dynamically load skill in '${entry.name}': ${importErr.message}`);
            }
          }
        }
      }
      this.initialized = true;
    } catch (err) {
      logger.warn(`Skill auto-discovery warning: ${err.message}`);
    }
  }
}

export const skillLoader = new SkillLoader();
