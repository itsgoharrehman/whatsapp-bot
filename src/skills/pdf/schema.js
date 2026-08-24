/**
 * PDF Document Schema Validator, Sanitizer & 5-Theme Design Engine
 * Implements 5 completely distinct, bespoke visual themes matching user references:
 * 1. editorial_clean: Clean white editorial canvas, minimalist typography, subtle divider rules, clean structured tables.
 * 2. retro_pixel: Cool gray background, teal display title, coral red H2 with dotted divider, monospace Courier body, coral-bordered dark card and lilac-bordered yellow card.
 * 3. pastel_chic: Ice-blue background, deep violet title, pink pill capsule H2, purple pill badge H3, pink card with nested purple badge, purple vertical accent highlight card.
 * 4. playful_pop: Soft lilac background, bubbly coral pink title with festive striped ribbon divider, yellow banner tag H2 with cyan text, cyan-bordered white card with curved corners, yellow-dotted watermelon-pink card.
 * 5. aurora_neon: Clean white canvas with peach bubble aura, purple title with hot-pink gradient underline bar, gradient circular bullets, dashed pink underlines, teal card with hot-pink left bar, and teal tables with cream cells.
 */

export const PDF_THEMES = {
  editorial_clean: {
    id: 'editorial_clean',
    name: 'Black & White Editorial',
    background: '#FFFFFF',
    fontBody: 'Helvetica',
    fontBodyBold: 'Helvetica-Bold',
    fontHeading: 'Helvetica-Bold',
    fontHeadingOblique: 'Helvetica-BoldOblique',
    titleColor: '#111827',
    subtitleColor: '#374151',
    metaColor: '#6B7280',
    dividerColor: '#E5E7EB',
    textPrimary: '#374151',
    textMuted: '#4B5563',
    h2Color: '#111827',
    h3Color: '#1F2937',
    h4Color: '#374151',
    h5Color: '#4B5563',
    h6Color: '#6B7280',
    primary: '#111827',
    secondary: '#374151',
    accent: '#111827',
    border: '#E2E8F0',
    table: {
      headerBg: '#F1F5F9',
      headerText: '#0F172A',
      rowBg1: '#FFFFFF',
      rowBg2: '#FFFFFF',
      border: '#E2E8F0',
      textColor: '#334155'
    }
  },
  retro_pixel: {
    id: 'retro_pixel',
    name: 'Retro Pixel Terminal',
    background: '#F2F2F2',
    fontBody: 'Courier',
    fontBodyBold: 'Courier-Bold',
    fontHeading: 'Courier-Bold',
    fontHeadingOblique: 'Courier-Oblique',
    titleColor: '#48A9A6',
    subtitleColor: '#555555',
    metaColor: '#777777',
    dividerColor: '#48A9A6',
    textPrimary: '#222222',
    textMuted: '#555555',
    h2Color: '#EB6B56',
    h3Color: '#E8B84B',
    h4Color: '#D67BD8',
    h5Color: '#5CA0D3',
    h6Color: '#4338CA',
    primary: '#48A9A6',
    secondary: '#EB6B56',
    accent: '#E8B84B',
    border: '#EB6B56',
    table: {
      headerBg: '#1E1E1E',
      headerText: '#5CBDB9',
      rowBg1: '#FFFFFF',
      rowBg2: '#F8FAFC',
      border: '#EB6B56',
      textColor: '#222222'
    }
  },
  pastel_chic: {
    id: 'pastel_chic',
    name: 'Pastel Chic Boutique',
    background: '#EDF7FD',
    fontBody: 'Helvetica',
    fontBodyBold: 'Helvetica-Bold',
    fontHeading: 'Helvetica-Bold',
    fontHeadingOblique: 'Helvetica-BoldOblique',
    titleColor: '#7E3FF2',
    subtitleColor: '#2C3E50',
    metaColor: '#64748B',
    dividerColor: '#E3739E',
    textPrimary: '#2C3E50',
    textMuted: '#64748B',
    h2Color: '#1E1E1E',
    h3Color: '#FFFFFF',
    h4Color: '#E3739E',
    h5Color: '#F472B6',
    h6Color: '#818CF8',
    primary: '#7E3FF2',
    secondary: '#E3739E',
    accent: '#7E3FF2',
    border: '#E3739E',
    table: {
      headerBg: '#7E3FF2',
      headerText: '#FFFFFF',
      rowBg1: '#FFFFFF',
      rowBg2: '#F5F3FF',
      border: '#E3739E',
      textColor: '#2C3E50'
    }
  },
  playful_pop: {
    id: 'playful_pop',
    name: 'Playful Pop Candy',
    background: '#EDE7F6',
    fontBody: 'Helvetica',
    fontBodyBold: 'Helvetica-Bold',
    fontHeading: 'Helvetica-Bold',
    fontHeadingOblique: 'Helvetica-BoldOblique',
    titleColor: '#EF476F',
    subtitleColor: '#2D3748',
    metaColor: '#6B7280',
    dividerColor: '#FFD166',
    textPrimary: '#2D3748',
    textMuted: '#718096',
    h2Color: '#00BCD4',
    h3Color: '#EF476F',
    h4Color: '#38B6FF',
    h5Color: '#FFD166',
    h6Color: '#EF476F',
    ribbonColors: ['#FFD166', '#06D6A0', '#EF476F', '#38B6FF'],
    primary: '#EF476F',
    secondary: '#FFD166',
    accent: '#38B6FF',
    border: '#38B6FF',
    table: {
      headerBg: '#EF476F',
      headerText: '#FFFFFF',
      rowBg1: '#FFFFFF',
      rowBg2: '#FFFBEB',
      border: '#FFD166',
      textColor: '#2D3748'
    }
  },
  aurora_neon: {
    id: 'aurora_neon',
    name: 'Aurora Neon Gradient',
    background: '#FFFFFF',
    fontBody: 'Helvetica',
    fontBodyBold: 'Helvetica-Bold',
    fontHeading: 'Helvetica-Bold',
    fontHeadingOblique: 'Helvetica-BoldOblique',
    titleColor: '#5B50D6',
    subtitleColor: '#2D3748',
    metaColor: '#6B7280',
    dividerColor: '#FF4081',
    textPrimary: '#2D3748',
    textMuted: '#718096',
    h2Color: '#EC4899',
    h3Color: '#EC4899',
    h4Color: '#06B6D4',
    h5Color: '#10B981',
    h6Color: '#F59E0B',
    primary: '#5B50D6',
    secondary: '#EC4899',
    accent: '#06B6D4',
    border: '#06B6D4',
    table: {
      headerBg: '#06B6D4',
      headerText: '#FFFFFF',
      rowBg1: '#FFFDF0',
      rowBg2: '#FFFFFF',
      border: '#06B6D4',
      textColor: '#2D3748'
    }
  }
};

export const THEME_PALETTES = PDF_THEMES;

export class DocumentSchema {
  /**
   * Detects the appropriate theme based on user prompt and document signals.
   */
  static detectTheme(prompt = '', data = {}) {
    const p = (prompt + ' ' + (data.title || '') + ' ' + (data.subtitle || '') + ' ' + (data.themeColor || '')).toLowerCase();
    if (p.includes('retro_pixel') || p.includes('retro') || p.includes('pixel') || p.includes('arcade') || p.includes('terminal') || p.includes('hacker')) {
      return 'retro_pixel';
    }
    if (p.includes('pastel_chic') || p.includes('pastel') || p.includes('chic') || p.includes('boutique') || p.includes('aesthetic') || p.includes('lavender')) {
      return 'pastel_chic';
    }
    if (p.includes('playful_pop') || p.includes('playful') || p.includes('pop') || p.includes('candy') || p.includes('festive') || p.includes('vibrant')) {
      return 'playful_pop';
    }
    if (p.includes('aurora_neon') || p.includes('aurora') || p.includes('neon') || p.includes('cyber') || p.includes('glow') || p.includes('futuristic')) {
      return 'aurora_neon';
    }
    return 'editorial_clean';
  }

  /**
   * Validates and sanitizes document object from AI.
   * Auto-repairs missing properties, cleans up whitespace, and ensures strict schema adherence.
   */
  static validateAndSanitize(data, userPrompt = '') {
    if (!data || typeof data !== 'object') {
      return this.repairFromText(String(data || ''), userPrompt);
    }

    const doc = {};

    // 1. Document Type
    const validTypes = ['report', 'guide', 'summary', 'document'];
    const rawType = String(data.documentType || data.type || '').toLowerCase();
    doc.documentType = validTypes.includes(rawType) ? rawType : this.detectDocumentType(userPrompt, data);

    // 2. Palette / Theme Selection
    const rawTheme = String(data.themeColor || data.theme || '').toLowerCase().trim();
    doc.themeColor = PDF_THEMES[rawTheme] ? rawTheme : this.detectTheme(userPrompt, data);
    doc.theme = PDF_THEMES[doc.themeColor] || PDF_THEMES.editorial_clean;
    doc.palette = doc.theme; // backwards-compatible

    // 3. Metadata (clean, only what is provided)
    doc.title = (data.title || this.extractFallbackTitle(userPrompt) || 'Document').replace(/\*\*/g, '').trim();
    doc.subtitle = (data.subtitle || '').replace(/\*\*/g, '').trim();
    doc.author = (data.author || '').replace(/\*\*/g, '').trim();
    doc.date = (data.date || '').replace(/\*\*/g, '').trim();
    doc.version = (data.version || '').replace(/\*\*/g, '').trim();
    doc.category = (data.category || '').replace(/\*\*/g, '').trim();

    // 4. Executive Summary / Overview (optional, only if explicitly provided)
    const rawSummary = data.executiveSummary || data.summary || data.overview || '';
    doc.executiveSummary = typeof rawSummary === 'string' ? rawSummary.replace(/\*\*/g, '').trim() : (Array.isArray(rawSummary) ? rawSummary.join(' ').replace(/\*\*/g, '').trim() : '');

    // 5. Sections
    doc.sections = [];
    const rawSections = Array.isArray(data.sections) ? data.sections : [];

    if (rawSections.length === 0 && (data.content || data.body)) {
      // Fallback: create sections from body or paragraphs
      const bodyContent = data.content || data.body;
      if (typeof bodyContent === 'string') {
        doc.sections.push({
          heading: 'Overview',
          subheading: '',
          paragraphs: bodyContent.split(/\n\n+/).map(p => p.replace(/\*\*/g, '').trim()).filter(Boolean),
          bulletPoints: []
        });
      }
    } else {
      rawSections.forEach((s, idx) => {
        if (!s || typeof s !== 'object') return;
        const section = {
          heading: (s.heading || s.title || `Section ${idx + 1}`).replace(/\*\*/g, '').trim(),
          subheading: (s.subheading || s.subtitle || '').replace(/\*\*/g, '').trim(),
          paragraphs: [],
          bulletPoints: [],
          numberedSteps: [],
          subsections: []
        };

        // Paragraphs
        if (Array.isArray(s.paragraphs)) {
          section.paragraphs = s.paragraphs.map(p => String(p).trim()).filter(Boolean);
        } else if (typeof s.content === 'string' && s.content.trim()) {
          section.paragraphs = s.content.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
        } else if (typeof s.text === 'string' && s.text.trim()) {
          section.paragraphs = s.text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
        }

        // Bullet Points
        if (Array.isArray(s.bulletPoints)) {
          section.bulletPoints = s.bulletPoints.map(b => String(b).trim()).filter(Boolean);
        } else if (Array.isArray(s.bullets)) {
          section.bulletPoints = s.bullets.map(b => String(b).trim()).filter(Boolean);
        } else if (Array.isArray(s.points)) {
          section.bulletPoints = s.points.map(b => String(b).trim()).filter(Boolean);
        }

        // Numbered Steps
        if (Array.isArray(s.numberedSteps)) {
          section.numberedSteps = s.numberedSteps.map(st => String(st).trim()).filter(Boolean);
        } else if (Array.isArray(s.steps)) {
          section.numberedSteps = s.steps.map(st => String(st).trim()).filter(Boolean);
        }

        // Subsections
        const rawSubs = s.subsections || s.subSections || s.items;
        if (Array.isArray(rawSubs)) {
          rawSubs.forEach(sub => {
            if (sub && typeof sub === 'object') {
              const subObj = {
                heading: (sub.heading || sub.subheading || sub.title || '').replace(/\*\*/g, '').trim(),
                subheading: (sub.subheading || '').replace(/\*\*/g, '').trim(),
                paragraphs: Array.isArray(sub.paragraphs) ? sub.paragraphs.map(p => String(p).trim()).filter(Boolean) : (sub.text ? [String(sub.text).trim()] : []),
                bulletPoints: Array.isArray(sub.bulletPoints || sub.bullets || sub.points) ? (sub.bulletPoints || sub.bullets || sub.points).map(b => String(b).trim()).filter(Boolean) : [],
                numberedSteps: Array.isArray(sub.numberedSteps || sub.steps) ? (sub.numberedSteps || sub.steps).map(st => String(st).trim()).filter(Boolean) : []
              };

              // Subsection Table
              const rawSubTable = sub.table || sub.comparison;
              if (rawSubTable && typeof rawSubTable === 'object') {
                const sHeaders = Array.isArray(rawSubTable.headers) ? rawSubTable.headers : (Array.isArray(rawSubTable.columns) ? rawSubTable.columns : []);
                const sRows = Array.isArray(rawSubTable.rows) ? rawSubTable.rows : (Array.isArray(rawSubTable.data) ? rawSubTable.data : []);
                if (sHeaders.length > 0 && sRows.length > 0) {
                  subObj.table = {
                    title: (rawSubTable.title || '').replace(/\*\*/g, '').trim(),
                    headers: sHeaders.map(h => String(h).trim()),
                    rows: sRows.map(row => Array.isArray(row) ? row.map(cell => String(cell).trim()) : [String(row).trim()])
                  };
                }
              }

              // Subsection Callout
              const rawSubCallout = sub.callout;
              if (rawSubCallout && typeof rawSubCallout === 'object' && (rawSubCallout.text || rawSubCallout.content)) {
                subObj.callout = {
                  type: ['info', 'warning', 'success', 'tip', 'note', 'quote', 'highlight'].includes(String(rawSubCallout.type || rawSubCallout.style).toLowerCase())
                    ? String(rawSubCallout.type || rawSubCallout.style).toLowerCase()
                    : 'tip',
                  title: (rawSubCallout.title || '').replace(/\*\*/g, '').trim(),
                  text: (rawSubCallout.text || rawSubCallout.content || '').trim()
                };
              }

              // Subsection Code
              const rawSubCode = sub.code;
              if (rawSubCode && (typeof rawSubCode === 'string' || (typeof rawSubCode === 'object' && (rawSubCode.code || rawSubCode.snippet)))) {
                subObj.code = {
                  language: String(rawSubCode.language || 'text').trim(),
                  title: (rawSubCode.title || '').replace(/\*\*/g, '').trim(),
                  code: typeof rawSubCode === 'string' ? rawSubCode.trim() : (rawSubCode.code || rawSubCode.snippet || '').trim()
                };
              }

              // Subsection Visual
              const rawSubVisual = sub.visual || sub.diagram;
              if (rawSubVisual && typeof rawSubVisual === 'object') {
                const sNodes = Array.isArray(rawSubVisual.nodes) ? rawSubVisual.nodes : [];
                if (sNodes.length > 0) {
                  subObj.visual = {
                    type: 'diagram',
                    title: (rawSubVisual.title || '').replace(/\*\*/g, '').trim(),
                    nodes: sNodes.map(n => typeof n === 'string' ? { label: n, description: '' } : { label: n.label || '', description: n.description || '' })
                  };
                }
              }

              if (subObj.heading || subObj.paragraphs.length > 0 || subObj.bulletPoints.length > 0 || subObj.numberedSteps.length > 0 || subObj.table || subObj.callout) {
                section.subsections.push(subObj);
              }
            }
          });
        }

        // Callout card
        const rawCallout = s.callout || (Array.isArray(s.callouts) && s.callouts[0]);
        if (rawCallout) {
          if (typeof rawCallout === 'string' && rawCallout.trim()) {
            section.callout = {
              type: 'tip',
              title: 'Key Takeaway',
              text: rawCallout.trim()
            };
          } else if (typeof rawCallout === 'object' && (rawCallout.text || rawCallout.content || rawCallout.body)) {
            section.callout = {
              type: ['tip', 'quote', 'important', 'warning', 'info', 'takeaway', 'note', 'highlight'].includes(String(rawCallout.style || rawCallout.type).toLowerCase())
                ? String(rawCallout.style || rawCallout.type).toLowerCase()
                : 'tip',
              title: (rawCallout.title || '').replace(/\*\*/g, '').trim(),
              text: (rawCallout.text || rawCallout.content || rawCallout.body || '').trim()
            };
          }
        }

        // Code Block
        const rawCode = s.code || s.codeBlock || s.snippet;
        if (rawCode && (typeof rawCode === 'string' || (typeof rawCode === 'object' && (rawCode.code || rawCode.snippet)))) {
          if (typeof rawCode === 'string') {
            section.code = { language: 'text', title: '', code: rawCode.trim() };
          } else {
            section.code = {
              language: String(rawCode.language || rawCode.lang || 'text').trim(),
              title: (rawCode.title || '').replace(/\*\*/g, '').trim(),
              code: typeof rawCode.code === 'string' ? rawCode.code.trim() : String(rawCode.snippet || '').trim()
            };
          }
        }

        // Visual (diagram, flowchart)
        const rawVisual = s.visual || s.diagram || s.flowchart;
        if (rawVisual && typeof rawVisual === 'object') {
          const rawNodes = Array.isArray(rawVisual.nodes) ? rawVisual.nodes : (Array.isArray(rawVisual.steps) ? rawVisual.steps : []);
          section.visual = {
            type: 'diagram',
            title: (rawVisual.title || '').replace(/\*\*/g, '').trim(),
            nodes: rawNodes.map(n => typeof n === 'string' ? { label: n, description: '' } : { label: n.label || n.title || n.name || '', description: n.description || n.desc || '' })
          };
        }

        // Table
        const rawTable = s.table || s.comparison || (Array.isArray(s.tables) && s.tables[0]);
        if (rawTable && typeof rawTable === 'object') {
          const headers = Array.isArray(rawTable.headers) ? rawTable.headers : (Array.isArray(rawTable.columns) ? rawTable.columns : (Array.isArray(rawTable.head) ? rawTable.head : []));
          const rows = Array.isArray(rawTable.rows) ? rawTable.rows : (Array.isArray(rawTable.data) ? rawTable.data : (Array.isArray(rawTable.body) ? rawTable.body : []));
          if (headers.length > 0 && rows.length > 0) {
            section.table = {
              title: (rawTable.title || '').replace(/\*\*/g, '').trim(),
              headers: headers.map(h => String(h).trim()),
              rows: rows.map(row => Array.isArray(row) ? row.map(cell => String(cell).trim()) : [String(row).trim()])
            };
          }
        }

        if (section.heading || section.paragraphs.length > 0 || section.bulletPoints.length > 0 || section.numberedSteps?.length > 0 || section.table || section.callout) {
          doc.sections.push(section);
        }
      });
    }

    // 6. Key Takeaways (optional)
    doc.keyTakeaways = [];
    const rawTakeaways = data.keyTakeaways || data.takeaways || data.highlights || [];
    if (Array.isArray(rawTakeaways)) {
      doc.keyTakeaways = rawTakeaways.map(t => String(t).trim()).filter(Boolean);
    }

    // 7. Conclusion (optional)
    const rawConclusion = data.conclusion || data.closing || data.summaryWrap || '';
    doc.conclusion = typeof rawConclusion === 'string' ? rawConclusion.trim() : (Array.isArray(rawConclusion) ? rawConclusion.join(' ') : '');

    // 8. Footer Note (clean doc title, no watermark)
    doc.footerNote = (data.footerNote || doc.title).trim();

    return doc;
  }

  /**
   * Intelligently parses raw text / markdown into a structured document model
   * when AI output is not valid JSON.
   */
  static repairFromText(text, userPrompt = '') {
    let cleanText = (text || '').trim();

    // If cleanText contains raw JSON indicators, clean out JSON syntax
    if (cleanText.includes('"documentType"') || cleanText.includes('"sections"') || cleanText.includes('```json')) {
      cleanText = cleanText
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .replace(/"(?:documentType|themeColor|theme|title|subtitle|author|date|version|category|executiveSummary|sections|heading|subheading|paragraphs|bulletPoints|callout|table|headers|rows|keyTakeaways|conclusion|footerNote)"\s*:\s*/gi, '')
        .replace(/[{}\[\]"]/g, '')
        .replace(/,\s*\n/g, '\n')
        .trim();
    }

    const title = this.extractFallbackTitle(userPrompt) || 'Document';
    const docType = this.detectDocumentType(userPrompt, {});
    const themeColor = this.detectTheme(userPrompt, {});
    const theme = PDF_THEMES[themeColor] || THEME_PALETTES[themeColor] || PDF_THEMES.editorial_clean;

    const doc = {
      documentType: docType,
      themeColor: themeColor,
      theme: theme,
      palette: theme,
      title: title,
      subtitle: '',
      author: '',
      date: '',
      version: '',
      category: '',
      executiveSummary: '',
      sections: [],
      keyTakeaways: [],
      conclusion: '',
      footerNote: title
    };

    if (!cleanText) {
      doc.sections.push({
        heading: '1. Overview',
        subheading: '',
        paragraphs: ['No specific content was generated for this topic.'],
        bulletPoints: []
      });
      return doc;
    }

    // Split text by markdown headings or double newlines
    const rawBlocks = cleanText.split(/(?=\n#{1,3}\s+)/g);
    let currentSection = null;

    for (const block of rawBlocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      const headerMatch = trimmed.match(/^#{1,3}\s+(.+)$/m);
      if (headerMatch) {
        if (currentSection) doc.sections.push(currentSection);
        const heading = headerMatch[1].replace(/\*\*/g, '').trim();
        const contentAfterHeader = trimmed.replace(/^#{1,3}\s+.+$/m, '').trim();

        currentSection = {
          heading,
          subheading: '',
          paragraphs: [],
          bulletPoints: []
        };

        this.parseParagraphsAndBullets(contentAfterHeader, currentSection);
      } else {
        if (!currentSection) {
          currentSection = {
            heading: '1. Overview',
            subheading: '',
            paragraphs: [],
            bulletPoints: []
          };
        }
        this.parseParagraphsAndBullets(trimmed, currentSection);
      }
    }

    if (currentSection) {
      doc.sections.push(currentSection);
    }

    return doc;
  }

  static parseParagraphsAndBullets(textBlock, sectionObj) {
    const lines = textBlock.split(/\r?\n/);
    let currentParagraph = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        if (currentParagraph.length > 0) {
          sectionObj.paragraphs.push(currentParagraph.join(' '));
          currentParagraph = [];
        }
        continue;
      }

      // Check if bullet point
      const bulletMatch = trimmedLine.match(/^[-*•]\s+(.+)$/);
      const numberMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);

      if (bulletMatch) {
        if (currentParagraph.length > 0) {
          sectionObj.paragraphs.push(currentParagraph.join(' '));
          currentParagraph = [];
        }
        sectionObj.bulletPoints.push(bulletMatch[1].replace(/\*\*/g, '').trim());
      } else if (numberMatch) {
        if (currentParagraph.length > 0) {
          sectionObj.paragraphs.push(currentParagraph.join(' '));
          currentParagraph = [];
        }
        sectionObj.bulletPoints.push(numberMatch[1].replace(/\*\*/g, '').trim());
      } else {
        currentParagraph.push(trimmedLine.replace(/\*\*/g, ''));
      }
    }

    if (currentParagraph.length > 0) {
      sectionObj.paragraphs.push(currentParagraph.join(' '));
    }
  }

  static detectDocumentType(prompt = '', data = {}) {
    const lower = (prompt + ' ' + (data.title || '')).toLowerCase();
    if (/\b(guide|tutorial|cheatsheet|cheat sheet|how to|quickstart|handbook|beginner)\b/i.test(lower)) {
      return 'guide';
    }
    if (/\b(summary|brief|recap|tldr|one-pager|memo|executive summary)\b/i.test(lower)) {
      return 'summary';
    }
    if (/\b(report|analysis|whitepaper|research|study|case study|trends|review)\b/i.test(lower)) {
      return 'report';
    }
    return 'document';
  }

  static extractFallbackTitle(prompt = '') {
    if (!prompt) return 'Executive Overview';
    let clean = prompt
      .replace(/^@mark\s*\([^)]*\)\s*/i, '')
      .replace(/^(make|create|generate|write|build)\s+(a|an|the)?\s*(beautiful|detailed|professional|comprehensive)?\s*(pdf|document|report|guide|summary)?\s*(on|about|explaining|for)?\s*/i, '')
      .trim();

    if (!clean) return 'Executive Overview';
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    if (clean.length > 60) {
      clean = clean.substring(0, 57) + '...';
    }
    return clean;
  }

  /**
   * Intelligently resolves the theme based on user prompts, data properties, and keywords.
   * Maps to one of 5 distinct themes:
   * - editorial_clean (Theme 1)
   * - retro_pixel (Theme 2)
   * - pastel_chic (Theme 3)
   * - playful_pop (Theme 4)
   * - aurora_neon (Theme 5)
   */
  static detectTheme(userPrompt = '', data = {}) {
    const rawDataTheme = String(data.themeColor || data.theme || '').toLowerCase().trim();
    if (rawDataTheme && THEME_PALETTES[rawDataTheme]) {
      return THEME_PALETTES[rawDataTheme].id;
    }

    const lower = (userPrompt + ' ' + rawDataTheme).toLowerCase();

    // Theme 2: retro_pixel
    if (/\b(retro|pixel|8bit|8-bit|y2k|arcade|console|terminal|cyber retro|theme 2|pdf 2|pdf2)\b/.test(lower)) {
      return 'retro_pixel';
    }

    // Theme 3: pastel_chic
    if (/\b(pastel|lavender|chic|candy|soft|rose|cute|playful chic|theme 3|pdf 3|pdf3)\b/.test(lower)) {
      return 'pastel_chic';
    }

    // Theme 4: playful_pop
    if (/\b(pop|playful|memphis|carnival|fun|colorful|vibrant|children|kids|festival|party|theme 4|pdf 4|pdf4)\b/.test(lower)) {
      return 'playful_pop';
    }

    // Theme 5: aurora_neon
    if (/\b(aurora|neon|gradient|cyber|modern|sunset|future|futuristic|tech|ai|saas|dark mode|night|theme 5|pdf 5|pdf5)\b/.test(lower)) {
      return 'aurora_neon';
    }

    // Theme 1: editorial_clean
    if (/\b(editorial|clean|minimal|academic|classic|white|light|doc|simple|monochrome|grayscale|print|black and white|theme 1|pdf 1|pdf1)\b/.test(lower)) {
      return 'editorial_clean';
    }

    // Color keyword fallbacks
    if (/\b(pink|purple|violet|magenta)\b/.test(lower)) return 'pastel_chic';
    if (/\b(yellow|orange|amber|gold|coral|red|crimson)\b/.test(lower)) return 'playful_pop';
    if (/\b(cyan|teal|blue|indigo|emerald|green|dark)\b/.test(lower)) return 'aurora_neon';
    if (/\b(gray|grey|slate|charcoal|navy|black)\b/.test(lower)) return 'editorial_clean';

    // Topic heuristics
    if (/\b(code|terminal|cli|algorithm|debugging)\b/.test(lower)) return 'retro_pixel';
    if (/\b(ai|llm|cloud|startup|innovation|release)\b/.test(lower)) return 'aurora_neon';
    if (/\b(creative|beauty|wellness|art|lifestyle)\b/.test(lower)) return 'pastel_chic';
    if (/\b(pitch|sales|presentation|flyer|event)\b/.test(lower)) return 'playful_pop';

    return 'editorial_clean';
  }

  static inferCategory(title = '', prompt = '') {
    const combined = (title + ' ' + prompt).toLowerCase();
    if (/\b(ai|llm|machine learning|python|javascript|coding|docker|cloud|software|api|database)\b/i.test(combined)) {
      return 'Engineering & Technology';
    }
    if (/\b(finance|money|stock|market|crypto|investment|business|startup|revenue)\b/i.test(combined)) {
      return 'Business & Strategy';
    }
    if (/\b(health|fitness|nutrition|wellness|medical)\b/i.test(combined)) {
      return 'Health & Science';
    }
    return 'General & Industry';
  }
}
