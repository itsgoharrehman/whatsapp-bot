import pptxgen from 'pptxgenjs';
import { logger } from '../../utils/logger.js';

export class PPTXRenderer {
  /**
   * Fetches an online high-resolution image as Base64 data with timeout guard.
   * Supports direct HTTP URLs or natural language keywords (via Pollinations / Unsplash).
   */
  static async fetchImageBase64(queryOrUrl) {
    if (!queryOrUrl || typeof queryOrUrl !== 'string') return null;
    const clean = queryOrUrl.trim();
    if (!clean) return null;

    let url = clean;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      const promptQuery = `${clean} editorial photography clean professional`;
      // Compact 640x360 image to save memory and CPU on free-tier hosting
      url = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptQuery)}?width=640&height=360&nologo=true`;
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf || buf.length < 500 || buf.length > 500000) return null;
      return `image/jpeg;base64,${buf.toString('base64')}`;
    } catch (err) {
      return null;
    }
  }

  /**
   * Cleans text to strip emojis and unwanted AI artifacts.
   */
  static cleanText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Formats bullet runs with bold lead-in phrases.
   */
  static formatBulletRuns(text, palette) {
    const clean = this.cleanText(text);
    const colonIdx = clean.indexOf(':');
    if (colonIdx > 0 && colonIdx < 45) {
      return [
        { text: clean.substring(0, colonIdx + 1) + ' ', options: { bold: true, color: palette.primary, fontSize: 12, fontFace: 'Arial' } },
        { text: clean.substring(colonIdx + 1).trim(), options: { bold: false, color: palette.text, fontSize: 12, fontFace: 'Arial' } }
      ];
    }
    return [{ text: clean, options: { bold: false, color: palette.text, fontSize: 12, fontFace: 'Arial' } }];
  }

  /**
   * Renders a PresentationSpec into a complete PowerPoint (.pptx) binary Buffer.
   */
  static async render(spec) {
    const pres = new pptxgen();

    // 16:9 widescreen layout (10.0 x 5.625 inches)
    pres.layout = 'LAYOUT_16x9';
    pres.author = spec.author || 'Mark • Personal AI Assistant';
    pres.title = spec.title || 'Presentation';
    pres.subject = spec.subtitle || 'Strategic Presentation';

    const palette = spec.palette || {
      primary: '4F46E5',
      secondary: '06B6D4',
      accent: '10B981',
      bg: 'F8FAFC',
      cardBg: 'FFFFFF',
      text: '0F172A',
      subtext: '64748B',
      border: 'E2E8F0',
      isDark: false
    };

    const totalSlides = spec.slides.length;

    // Controlled pre-fetch of images for visual slides (max 2 images per deck to conserve memory)
    let fetchedCount = 0;
    for (const slideData of spec.slides) {
      if ((slideData.type === 'text_image' || slideData.type === 'image' || slideData.imageUrl || slideData.imageQuery) && fetchedCount < 2) {
        const query = slideData.imageUrl || slideData.imageQuery || slideData.title;
        slideData._imageData = await this.fetchImageBase64(query);
        if (slideData._imageData) fetchedCount++;
      }
    }

    spec.slides.forEach((slideData, idx) => {
      const slide = pres.addSlide();
      slide.background = { color: palette.bg };

      // Attach speaker notes
      if (slideData.notes) {
        slide.addNotes(this.cleanText(slideData.notes));
      }

      switch (slideData.type) {
        case 'title':
          this.renderTitleSlide(pres, slide, slideData, spec, palette);
          break;

        case 'section_header':
          this.renderSectionHeaderSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'quote':
          this.renderQuoteSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'diagram':
          this.renderDiagramSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'chart':
          this.renderChartSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'table':
          this.renderTableSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'comparison':
          this.renderComparisonSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'kpi':
        case 'statistics':
          this.renderKPISlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'process':
        case 'flowchart':
          this.renderProcessSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'timeline':
          this.renderTimelineSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'architecture':
        case 'hierarchy':
          this.renderArchitectureSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'text_image':
          this.renderTextImageSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'image':
          this.renderImageSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'conclusion':
        case 'takeaways':
          this.renderConclusionSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'references':
          this.renderReferencesSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;

        case 'text':
        case 'content':
        case 'cards':
        default:
          this.renderTextSlide(pres, slide, slideData, spec, palette, idx, totalSlides);
          break;
      }
    });

    const buffer = await pres.write({ outputType: 'nodebuffer' });
    logger.info(`[PPTX:RENDER] Generated presentation: "${spec.title}" | Slides: ${totalSlides} | Size: ${buffer.length} bytes`);
    return buffer;
  }

  /**
   * Adds standard header and footer to a content slide.
   */
  static addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides) {
    // Category label
    const categoryText = this.cleanText(slideData.category || spec.category || 'OVERVIEW').toUpperCase();
    slide.addText(categoryText, {
      x: 0.8,
      y: 0.35,
      w: 6.0,
      h: 0.25,
      fontSize: 8.5,
      bold: true,
      color: palette.secondary,
      fontFace: 'Arial'
    });

    // Slide Title
    const titleText = this.cleanText(slideData.title);
    slide.addText(titleText, {
      x: 0.8,
      y: 0.55,
      w: 8.4,
      h: 0.55,
      fontSize: 18,
      bold: true,
      color: palette.isDark ? 'FFFFFF' : palette.text,
      fontFace: 'Arial'
    });

    // Subtle Accent Line
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.8,
      y: 1.15,
      w: 1.2,
      h: 0.03,
      fill: { color: palette.primary },
      line: { color: palette.primary }
    });

    // Footer: Title & Slide Number
    slide.addText(this.cleanText(spec.title), {
      x: 0.8,
      y: 5.25,
      w: 6.5,
      h: 0.25,
      fontSize: 8,
      color: palette.subtext,
      fontFace: 'Arial'
    });

    slide.addText(`${idx + 1} / ${totalSlides}`, {
      x: 8.2,
      y: 5.25,
      w: 1.0,
      h: 0.25,
      fontSize: 8,
      align: 'right',
      color: palette.subtext,
      fontFace: 'Arial'
    });
  }

  /**
   * Title Slide: Full-bleed premium cover with clean typography.
   */
  static renderTitleSlide(pres, slide, slideData, spec, palette) {
    const titleBgColor = palette.isDark ? '0A0E17' : '0F172A';
    slide.background = { color: titleBgColor };

    // Decorative geometric accents
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 7.2,
      y: 0.5,
      w: 2.3,
      h: 4.6,
      fill: { color: palette.primary, transparency: 85 },
      line: { color: palette.secondary, width: 1, transparency: 70 }
    });

    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 6.8,
      y: 1.0,
      w: 2.3,
      h: 3.6,
      fill: { color: palette.secondary, transparency: 90 },
      line: { color: palette.primary, width: 1, transparency: 80 }
    });

    // Category Tag
    const categoryText = this.cleanText(slideData.category || spec.category || 'PRESENTATION').toUpperCase();
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8,
      y: 1.0,
      w: 2.2,
      h: 0.35,
      fill: { color: palette.primary },
      line: { color: palette.primary }
    });
    slide.addText(categoryText, {
      x: 0.8,
      y: 1.0,
      w: 2.2,
      h: 0.35,
      fontSize: 9,
      bold: true,
      align: 'center',
      color: 'FFFFFF',
      fontFace: 'Arial'
    });

    // Main Presentation Title
    slide.addText(this.cleanText(spec.title), {
      x: 0.8,
      y: 1.55,
      w: 6.0,
      h: 1.5,
      fontSize: 28,
      bold: true,
      color: 'FFFFFF',
      fontFace: 'Arial',
      valign: 'top'
    });

    // Subtitle
    if (spec.subtitle) {
      slide.addText(this.cleanText(spec.subtitle), {
        x: 0.8,
        y: 3.15,
        w: 5.8,
        h: 0.8,
        fontSize: 14,
        color: '94A3B8',
        fontFace: 'Arial',
        valign: 'top'
      });
    }

    // Divider Line
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.8,
      y: 4.1,
      w: 5.5,
      h: 0.02,
      fill: { color: '334155' },
      line: { color: '334155' }
    });

    // Author & Date Metadata
    const authorText = this.cleanText(spec.author || 'Mark • Personal AI Assistant');
    const dateText = this.cleanText(spec.date || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

    slide.addText(`${authorText}   •   ${dateText}`, {
      x: 0.8,
      y: 4.3,
      w: 6.0,
      h: 0.4,
      fontSize: 10,
      color: '64748B',
      fontFace: 'Arial'
    });
  }

  /**
   * Section Header / Divider Slide.
   */
  static renderSectionHeaderSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    const headerBg = palette.isDark ? '1E293B' : palette.primary;
    slide.background = { color: headerBg };

    const secNum = this.cleanText(slideData.sectionNumber || `0${idx}`);
    slide.addText(`SECTION ${secNum}`, {
      x: 1.0,
      y: 1.5,
      w: 8.0,
      h: 0.4,
      fontSize: 13,
      bold: true,
      color: palette.secondary,
      fontFace: 'Arial'
    });

    slide.addText(this.cleanText(slideData.title), {
      x: 1.0,
      y: 1.95,
      w: 8.0,
      h: 1.2,
      fontSize: 26,
      bold: true,
      color: 'FFFFFF',
      fontFace: 'Arial'
    });

    if (slideData.description) {
      slide.addText(this.cleanText(slideData.description), {
        x: 1.0,
        y: 3.25,
        w: 7.5,
        h: 1.0,
        fontSize: 13,
        color: palette.isDark ? '94A3B8' : 'E0E7FF',
        fontFace: 'Arial'
      });
    }

    slide.addText(`${idx + 1} / ${totalSlides}`, {
      x: 8.2,
      y: 5.0,
      w: 1.0,
      h: 0.3,
      fontSize: 8,
      align: 'right',
      color: '94A3B8',
      fontFace: 'Arial'
    });
  }

  /**
   * Quote Slide: High-impact editorial statement.
   */
  static renderQuoteSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    // Left Quote Accent Bar
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 1.2,
      y: 1.8,
      w: 0.08,
      h: 2.4,
      fill: { color: palette.primary },
      line: { color: palette.primary }
    });

    // Quote Text
    const quoteText = `"${this.cleanText(slideData.quote)}"`;
    slide.addText(quoteText, {
      x: 1.5,
      y: 1.8,
      w: 7.2,
      h: 1.8,
      fontSize: 20,
      italic: true,
      color: palette.isDark ? 'FFFFFF' : palette.text,
      fontFace: 'Georgia',
      valign: 'middle'
    });

    // Author / Attribution
    if (slideData.author) {
      slide.addText(`— ${this.cleanText(slideData.author)}`, {
        x: 1.5,
        y: 3.8,
        w: 7.2,
        h: 0.4,
        fontSize: 12,
        bold: true,
        color: palette.secondary,
        fontFace: 'Arial'
      });
    }
  }

  /**
   * Diagram Slide: Visual connected flow.
   */
  static renderDiagramSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const nodes = (slideData.nodes || []).slice(0, 4);
    const count = Math.max(nodes.length, 2);
    const nodeW = (8.4 - (count - 1) * 0.4) / count;

    // Connecting line across nodes
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 1.2,
      y: 2.7,
      w: 7.6,
      h: 0.04,
      fill: { color: palette.border },
      line: { color: palette.border }
    });

    nodes.forEach((node, i) => {
      const nodeX = 0.8 + i * (nodeW + 0.4);

      // Node Card
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: nodeX,
        y: 1.6,
        w: nodeW,
        h: 3.2,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      // Node Number Badge
      slide.addShape(pres.shapes.OVAL, {
        x: nodeX + (nodeW - 0.5) / 2,
        y: 1.35,
        w: 0.5,
        h: 0.5,
        fill: { color: i === 0 ? palette.primary : (i === count - 1 ? palette.accent : palette.secondary) }
      });

      slide.addText(String(i + 1), {
        x: nodeX + (nodeW - 0.5) / 2,
        y: 1.35,
        w: 0.5,
        h: 0.5,
        fontSize: 11,
        bold: true,
        align: 'center',
        color: 'FFFFFF',
        fontFace: 'Arial'
      });

      slide.addText(this.cleanText(node.label), {
        x: nodeX + 0.15,
        y: 2.05,
        w: nodeW - 0.3,
        h: 0.55,
        fontSize: 12,
        bold: true,
        align: 'center',
        color: palette.isDark ? 'FFFFFF' : palette.text,
        fontFace: 'Arial'
      });

      slide.addText(this.cleanText(node.description), {
        x: nodeX + 0.15,
        y: 2.65,
        w: nodeW - 0.3,
        h: 1.9,
        fontSize: 10,
        align: 'center',
        color: palette.subtext,
        fontFace: 'Arial',
        valign: 'top'
      });
    });
  }

  /**
   * Text Slide: Clean typography with bold lead-ins.
   */
  static renderTextSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const bullets = slideData.bullets || [];
    const cards = slideData.cards || [];

    if (bullets.length > 0) {
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8,
        y: 1.4,
        w: 8.4,
        h: 3.5,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      let currentY = 1.7;
      bullets.forEach(b => {
        const runs = this.formatBulletRuns(b, palette);
        slide.addText(runs, {
          x: 1.2,
          y: currentY,
          w: 7.6,
          h: 0.65,
          bullet: { type: 'bullet', color: palette.primary },
          valign: 'top'
        });
        currentY += 0.7;
      });
    } else if (cards.length > 0) {
      const count = Math.min(cards.length, 3);
      const colW = (8.4 - (count - 1) * 0.3) / count;

      cards.slice(0, count).forEach((c, i) => {
        const colX = 0.8 + i * (colW + 0.3);

        slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
          x: colX,
          y: 1.4,
          w: colW,
          h: 3.5,
          fill: { color: palette.cardBg },
          line: { color: palette.border, width: 1 }
        });

        slide.addShape(pres.shapes.RECTANGLE, {
          x: colX,
          y: 1.4,
          w: colW,
          h: 0.06,
          fill: { color: i === 0 ? palette.primary : (i === 1 ? palette.secondary : palette.accent) }
        });

        slide.addText(this.cleanText(c.title), {
          x: colX + 0.2,
          y: 1.65,
          w: colW - 0.4,
          h: 0.55,
          fontSize: 13,
          bold: true,
          color: palette.isDark ? 'FFFFFF' : palette.text,
          fontFace: 'Arial'
        });

        slide.addText(this.cleanText(c.description), {
          x: colX + 0.2,
          y: 2.25,
          w: colW - 0.4,
          h: 2.4,
          fontSize: 11,
          color: palette.subtext,
          fontFace: 'Arial',
          valign: 'top'
        });
      });
    }
  }

  /**
   * Native PowerPoint Chart Slide.
   */
  static renderChartSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    if (slideData.analysis) {
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8,
        y: 1.35,
        w: 8.4,
        h: 0.45,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });
      slide.addText(`KEY TAKEAWAY: ${this.cleanText(slideData.analysis)}`, {
        x: 1.0,
        y: 1.35,
        w: 8.0,
        h: 0.45,
        fontSize: 9.5,
        color: palette.primary,
        bold: true,
        fontFace: 'Arial'
      });
    }

    const chartType = pres.ChartType[slideData.chartType] || pres.ChartType.bar;
    const labels = (slideData.data?.labels || ['Baseline', 'Current', 'Target']).map(l => this.cleanText(String(l)));
    const rawSeries = slideData.data?.series || [{ name: 'Values', values: [20, 45, 80] }];

    const chartData = rawSeries.map(s => ({
      name: this.cleanText(s.name || 'Metrics'),
      labels: labels,
      values: s.values
    }));

    const chartColors = [palette.primary, palette.secondary, palette.accent, '6366F1', 'EC4899', 'F59E0B'];
    const chartY = slideData.analysis ? 1.9 : 1.4;
    const chartH = slideData.analysis ? 3.1 : 3.6;

    slide.addChart(chartType, chartData, {
      x: 0.8,
      y: chartY,
      w: 8.4,
      h: chartH,
      showLegend: true,
      legendPos: 'b',
      chartColors: chartColors,
      chartColorsFill: chartColors,
      dataLabelColor: palette.isDark ? 'FFFFFF' : '0F172A',
      title: slideData.chartTitle ? this.cleanText(slideData.chartTitle) : undefined,
      titleColor: palette.text
    });
  }

  /**
   * Native PowerPoint Styled Table Slide.
   */
  static renderTableSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const headers = (slideData.headers || ['Category', 'Description', 'Impact']).map(h => this.cleanText(String(h)));
    const rows = slideData.rows || [['Architecture', 'Modular design', 'High scalability']];

    const tableData = [];

    // Header Row
    tableData.push(headers.map(h => ({
      text: h,
      options: {
        bold: true,
        fill: { color: palette.primary },
        color: 'FFFFFF',
        fontSize: 11,
        fontFace: 'Arial',
        align: 'left',
        valign: 'middle'
      }
    })));

    // Data Rows
    rows.forEach((row, rIdx) => {
      const isAlt = rIdx % 2 === 1;
      const rowFill = isAlt ? (palette.isDark ? '1E293B' : 'F1F5F9') : palette.cardBg;
      tableData.push(row.map(cell => ({
        text: this.cleanText(String(cell)),
        options: {
          fill: { color: rowFill },
          color: palette.isDark ? 'F8FAFC' : palette.text,
          fontSize: 10,
          fontFace: 'Arial',
          align: 'left',
          valign: 'middle'
        }
      })));
    });

    const colWidth = 8.4 / headers.length;
    const colWidths = headers.map(() => colWidth);

    slide.addTable(tableData, {
      x: 0.8,
      y: 1.45,
      w: 8.4,
      colW: colWidths,
      border: { color: palette.border, width: 1 }
    });

    if (slideData.caption) {
      slide.addText(`* ${this.cleanText(slideData.caption)}`, {
        x: 0.8,
        y: 4.8,
        w: 8.4,
        h: 0.3,
        fontSize: 8.5,
        color: palette.subtext,
        fontFace: 'Arial'
      });
    }
  }

  /**
   * Comparison Slide.
   */
  static renderComparisonSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const columns = (slideData.columns || []).slice(0, 3);
    const count = Math.max(columns.length, 2);
    const colW = (8.4 - (count - 1) * 0.3) / count;

    columns.forEach((col, i) => {
      const colX = 0.8 + i * (colW + 0.3);
      const isWinner = i === columns.length - 1;

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: colX,
        y: 1.4,
        w: colW,
        h: 3.5,
        fill: { color: palette.cardBg },
        line: { color: isWinner ? palette.primary : palette.border, width: isWinner ? 1.5 : 1 }
      });

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: colX,
        y: 1.4,
        w: colW,
        h: 0.55,
        fill: { color: isWinner ? palette.primary : (palette.isDark ? '334155' : 'E2E8F0') }
      });

      slide.addText(this.cleanText(col.name), {
        x: colX + 0.1,
        y: 1.4,
        w: colW - 0.2,
        h: 0.55,
        fontSize: 12,
        bold: true,
        align: 'center',
        color: isWinner ? 'FFFFFF' : (palette.isDark ? 'FFFFFF' : palette.text),
        fontFace: 'Arial'
      });

      const featureList = (col.features || []).map(f => ({
        text: this.cleanText(f),
        options: {
          bullet: { type: 'bullet', color: isWinner ? palette.primary : palette.subtext },
          fontSize: 10,
          color: palette.text,
          spaceAfter: 8,
          fontFace: 'Arial'
        }
      }));

      slide.addText(featureList, {
        x: colX + 0.2,
        y: 2.05,
        w: colW - 0.4,
        h: 2.1,
        valign: 'top'
      });

      if (col.verdict) {
        slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
          x: colX + 0.2,
          y: 4.35,
          w: colW - 0.4,
          h: 0.35,
          fill: { color: isWinner ? palette.accent : (palette.isDark ? '1E293B' : 'F1F5F9') }
        });
        slide.addText(this.cleanText(col.verdict).toUpperCase(), {
          x: colX + 0.2,
          y: 4.35,
          w: colW - 0.4,
          h: 0.35,
          fontSize: 8.5,
          bold: true,
          align: 'center',
          color: isWinner ? 'FFFFFF' : palette.subtext,
          fontFace: 'Arial'
        });
      }
    });
  }

  /**
   * KPI Slide (Clean Minimalist Hero Metrics).
   */
  static renderKPISlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const kpis = (slideData.kpis || []).slice(0, 3);
    const count = Math.max(kpis.length, 2);
    const cardW = (8.4 - (count - 1) * 0.3) / count;

    kpis.forEach((kpi, i) => {
      const cardX = 0.8 + i * (cardW + 0.3);

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cardX,
        y: 1.5,
        w: cardW,
        h: 3.3,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      slide.addShape(pres.shapes.RECTANGLE, {
        x: cardX,
        y: 1.5,
        w: cardW,
        h: 0.06,
        fill: { color: i === 0 ? palette.primary : (i === 1 ? palette.secondary : palette.accent) }
      });

      slide.addText(this.cleanText(kpi.value), {
        x: cardX + 0.1,
        y: 1.8,
        w: cardW - 0.2,
        h: 0.9,
        fontSize: 34,
        bold: true,
        align: 'center',
        color: palette.primary,
        fontFace: 'Arial'
      });

      slide.addText(this.cleanText(kpi.label), {
        x: cardX + 0.15,
        y: 2.75,
        w: cardW - 0.3,
        h: 0.5,
        fontSize: 12,
        bold: true,
        align: 'center',
        color: palette.isDark ? 'FFFFFF' : palette.text,
        fontFace: 'Arial'
      });

      if (kpi.change) {
        slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
          x: cardX + (cardW - 1.4) / 2,
          y: 3.35,
          w: 1.4,
          h: 0.3,
          fill: { color: palette.isDark ? '1E293B' : 'ECFDF5' }
        });
        slide.addText(this.cleanText(kpi.change), {
          x: cardX + (cardW - 1.4) / 2,
          y: 3.35,
          w: 1.4,
          h: 0.3,
          fontSize: 8.5,
          bold: true,
          align: 'center',
          color: palette.accent,
          fontFace: 'Arial'
        });
      }

      if (kpi.note) {
        slide.addText(this.cleanText(kpi.note), {
          x: cardX + 0.15,
          y: 3.75,
          w: cardW - 0.3,
          h: 0.8,
          fontSize: 9,
          align: 'center',
          color: palette.subtext,
          fontFace: 'Arial'
        });
      }
    });
  }

  /**
   * Process & Step Workflow Slide.
   */
  static renderProcessSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const steps = (slideData.steps || []).slice(0, 4);
    const count = Math.max(steps.length, 3);
    const stepW = (8.4 - (count - 1) * 0.25) / count;

    steps.forEach((step, i) => {
      const stepX = 0.8 + i * (stepW + 0.25);

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: stepX,
        y: 1.6,
        w: stepW,
        h: 3.2,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      slide.addShape(pres.shapes.OVAL, {
        x: stepX + (stepW - 0.55) / 2,
        y: 1.32,
        w: 0.55,
        h: 0.55,
        fill: { color: palette.primary },
        line: { color: palette.cardBg, width: 2 }
      });

      slide.addText(String(step.stepNumber || i + 1), {
        x: stepX + (stepW - 0.55) / 2,
        y: 1.32,
        w: 0.55,
        h: 0.55,
        fontSize: 11,
        bold: true,
        align: 'center',
        color: 'FFFFFF',
        fontFace: 'Arial'
      });

      slide.addText(this.cleanText(step.name), {
        x: stepX + 0.15,
        y: 2.05,
        w: stepW - 0.3,
        h: 0.55,
        fontSize: 12,
        bold: true,
        align: 'center',
        color: palette.isDark ? 'FFFFFF' : palette.text,
        fontFace: 'Arial'
      });

      slide.addText(this.cleanText(step.description), {
        x: stepX + 0.15,
        y: 2.65,
        w: stepW - 0.3,
        h: 1.9,
        fontSize: 10,
        align: 'center',
        color: palette.subtext,
        fontFace: 'Arial',
        valign: 'top'
      });
    });
  }

  /**
   * Timeline / Roadmap Slide.
   */
  static renderTimelineSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const milestones = (slideData.milestones || []).slice(0, 4);
    const count = Math.max(milestones.length, 3);
    const mileW = (8.4 - (count - 1) * 0.25) / count;

    // Spine Line
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 1.0,
      y: 2.1,
      w: 8.0,
      h: 0.04,
      fill: { color: palette.primary },
      line: { color: palette.primary }
    });

    milestones.forEach((m, i) => {
      const mileX = 0.8 + i * (mileW + 0.25);

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: mileX + (mileW - 1.4) / 2,
        y: 1.55,
        w: 1.4,
        h: 0.35,
        fill: { color: palette.primary }
      });
      slide.addText(this.cleanText(m.date), {
        x: mileX + (mileW - 1.4) / 2,
        y: 1.55,
        w: 1.4,
        h: 0.35,
        fontSize: 8.5,
        bold: true,
        align: 'center',
        color: 'FFFFFF',
        fontFace: 'Arial'
      });

      slide.addShape(pres.shapes.OVAL, {
        x: mileX + (mileW - 0.25) / 2,
        y: 1.99,
        w: 0.25,
        h: 0.25,
        fill: { color: palette.secondary },
        line: { color: 'FFFFFF', width: 2 }
      });

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: mileX,
        y: 2.4,
        w: mileW,
        h: 2.4,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      slide.addText(this.cleanText(m.title), {
        x: mileX + 0.15,
        y: 2.55,
        w: mileW - 0.3,
        h: 0.5,
        fontSize: 11.5,
        bold: true,
        color: palette.isDark ? 'FFFFFF' : palette.text,
        fontFace: 'Arial'
      });

      slide.addText(this.cleanText(m.description), {
        x: mileX + 0.15,
        y: 3.1,
        w: mileW - 0.3,
        h: 1.5,
        fontSize: 9.5,
        color: palette.subtext,
        fontFace: 'Arial',
        valign: 'top'
      });
    });
  }

  /**
   * Architecture & Tiered Layers Slide.
   */
  static renderArchitectureSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const layers = (slideData.layers || []).slice(0, 3);

    layers.forEach((layer, i) => {
      const layerY = 1.45 + i * 1.15;

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8,
        y: layerY,
        w: 8.4,
        h: 1.0,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 1.0,
        y: layerY + 0.15,
        w: 2.2,
        h: 0.7,
        fill: { color: i === 0 ? palette.primary : (i === 1 ? palette.secondary : palette.accent) }
      });

      slide.addText(this.cleanText(layer.name), {
        x: 1.0,
        y: layerY + 0.15,
        w: 2.2,
        h: 0.7,
        fontSize: 10.5,
        bold: true,
        align: 'center',
        color: 'FFFFFF',
        fontFace: 'Arial'
      });

      const comps = layer.components || [];
      const compW = (5.6 - (comps.length - 1) * 0.15) / Math.max(comps.length, 1);

      comps.slice(0, 4).forEach((comp, cIdx) => {
        const compX = 3.4 + cIdx * (compW + 0.15);
        slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
          x: compX,
          y: layerY + 0.25,
          w: compW,
          h: 0.5,
          fill: { color: palette.isDark ? '1E293B' : 'F1F5F9' },
          line: { color: palette.border, width: 1 }
        });
        slide.addText(this.cleanText(comp), {
          x: compX + 0.05,
          y: layerY + 0.25,
          w: compW - 0.1,
          h: 0.5,
          fontSize: 9.5,
          align: 'center',
          color: palette.isDark ? 'FFFFFF' : palette.text,
          fontFace: 'Arial'
        });
      });
    });
  }

  /**
   * Text + Image Slide: 2-Column Split with real high-resolution photograph.
   */
  static renderTextImageSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const hasImage = Boolean(slideData._imageData);
    const isLeftImage = slideData.position === 'left';
    const textW = hasImage ? 4.6 : 8.4;
    const textX = hasImage && isLeftImage ? 4.6 : 0.8;
    const imgX = isLeftImage ? 0.8 : 5.7;

    // Text Column
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: textX,
      y: 1.4,
      w: textW,
      h: 3.5,
      fill: { color: palette.cardBg },
      line: { color: palette.border, width: 1 }
    });

    const bullets = slideData.bullets || [];
    let currentY = 1.7;

    bullets.slice(0, 4).forEach(b => {
      const runs = this.formatBulletRuns(b, palette);
      slide.addText(runs, {
        x: textX + 0.3,
        y: currentY,
        w: textW - 0.6,
        h: 0.65,
        bullet: { type: 'bullet', color: palette.primary },
        valign: 'top'
      });
      currentY += 0.75;
    });

    // Image Column
    if (hasImage) {
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: imgX,
        y: 1.4,
        w: 3.5,
        h: 3.0,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      slide.addImage({
        data: slideData._imageData,
        x: imgX,
        y: 1.4,
        w: 3.5,
        h: 3.0,
        sizing: { type: 'cover', w: 3.5, h: 3.0 }
      });

      const captionText = this.cleanText(slideData.caption || slideData.callout || 'Visual Representation');
      slide.addText(captionText, {
        x: imgX,
        y: 4.5,
        w: 3.5,
        h: 0.4,
        fontSize: 9,
        italic: true,
        align: 'center',
        color: palette.subtext,
        fontFace: 'Arial'
      });
    }
  }

  /**
   * Hero Full Image Slide.
   */
  static renderImageSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    if (slideData._imageData) {
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8,
        y: 1.4,
        w: 8.4,
        h: 3.2,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      slide.addImage({
        data: slideData._imageData,
        x: 0.8,
        y: 1.4,
        w: 8.4,
        h: 3.2,
        sizing: { type: 'cover', w: 8.4, h: 3.2 }
      });

      if (slideData.caption) {
        slide.addText(`* ${this.cleanText(slideData.caption)}`, {
          x: 0.8,
          y: 4.7,
          w: 8.4,
          h: 0.35,
          fontSize: 9.5,
          align: 'center',
          color: palette.subtext,
          fontFace: 'Arial'
        });
      }
    } else {
      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8,
        y: 1.4,
        w: 8.4,
        h: 3.4,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      slide.addText(this.cleanText(slideData.imageConcept || slideData.title), {
        x: 1.0,
        y: 2.6,
        w: 8.0,
        h: 1.0,
        fontSize: 18,
        bold: true,
        align: 'center',
        color: palette.isDark ? 'FFFFFF' : palette.text,
        fontFace: 'Arial'
      });
    }
  }

  /**
   * Conclusion Slide: Key takeaways & actionable call to action.
   */
  static renderConclusionSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    // Summary Takeaways Card
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 2.3,
      fill: { color: palette.cardBg },
      line: { color: palette.border, width: 1 }
    });

    slide.addText('EXECUTIVE SUMMARY & KEY TAKEAWAYS', {
      x: 1.1,
      y: 1.6,
      w: 7.8,
      h: 0.3,
      fontSize: 10,
      bold: true,
      color: palette.secondary,
      fontFace: 'Arial'
    });

    const summaryPoints = (slideData.summaryPoints || []).map(p => this.cleanText(p));
    let currentY = 1.95;

    summaryPoints.slice(0, 3).forEach(p => {
      slide.addText(p, {
        x: 1.1,
        y: currentY,
        w: 7.8,
        h: 0.5,
        bullet: { type: 'bullet', color: palette.primary },
        fontSize: 11.5,
        color: palette.text,
        fontFace: 'Arial',
        valign: 'top'
      });
      currentY += 0.55;
    });

    // Call to Action Banner
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.8,
      y: 3.9,
      w: 8.4,
      h: 1.0,
      fill: { color: palette.primary }
    });

    slide.addText('NEXT STEPS & ACTION PLAN', {
      x: 1.1,
      y: 4.0,
      w: 7.8,
      h: 0.25,
      fontSize: 8.5,
      bold: true,
      color: palette.accent,
      fontFace: 'Arial'
    });

    slide.addText(this.cleanText(slideData.callToAction || 'Proceed to execution and deployment phase.'), {
      x: 1.1,
      y: 4.25,
      w: 7.8,
      h: 0.55,
      fontSize: 12,
      bold: true,
      color: 'FFFFFF',
      fontFace: 'Arial'
    });
  }

  /**
   * References & Sources Slide.
   */
  static renderReferencesSlide(pres, slide, slideData, spec, palette, idx, totalSlides) {
    this.addHeaderAndFooter(pres, slide, slideData, spec, palette, idx, totalSlides);

    const sources = (slideData.sources || []).slice(0, 4);

    sources.forEach((src, i) => {
      const srcY = 1.45 + i * 0.85;

      slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 0.8,
        y: srcY,
        w: 8.4,
        h: 0.75,
        fill: { color: palette.cardBg },
        line: { color: palette.border, width: 1 }
      });

      slide.addText(this.cleanText(src.title), {
        x: 1.1,
        y: srcY + 0.1,
        w: 7.8,
        h: 0.3,
        fontSize: 11,
        bold: true,
        color: palette.primary,
        fontFace: 'Arial'
      });

      const desc = src.url ? `${this.cleanText(src.description || 'Reference')} — ${src.url}` : this.cleanText(src.description || 'Documentation source');
      slide.addText(desc, {
        x: 1.1,
        y: srcY + 0.4,
        w: 7.8,
        h: 0.25,
        fontSize: 9,
        color: palette.subtext,
        fontFace: 'Arial'
      });
    });
  }
}
