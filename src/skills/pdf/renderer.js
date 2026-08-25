import PDFDocument from 'pdfkit';
import { DocumentSchema, PDF_THEMES } from './schema.js';

export class PDFRenderer {
  /**
   * Renders a sanitized document specification into a production-grade PDF Buffer.
   * Dynamically applies one of the 5 bespoke visual themes with strict coordinate isolation.
   * @param {Object} docData Sanitized document data (from DocumentSchema)
   * @returns {Promise<Buffer>}
   */
  static async render(docData) {
    const doc = DocumentSchema.validateAndSanitize(docData);
    const theme = doc.theme || PDF_THEMES.editorial_clean;

    return new Promise((resolve, reject) => {
      try {
        const pdf = new PDFDocument({
          size: 'A4',
          margins: { top: 45, bottom: 45, left: 45, right: 45 },
          bufferPages: true,
          info: {
            Title: doc.title,
            Author: doc.author || 'Mark AI',
            Subject: doc.subtitle || doc.title,
            Keywords: `${doc.category || ''}, ${doc.documentType || ''}, ${theme.name}`,
            Creator: 'Mark Personal AI Assistant',
            Producer: 'Mark PDF Vector Engine'
          }
        });

        const chunks = [];
        pdf.on('data', chunk => chunks.push(chunk));
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', err => reject(err));

        const pageWidth = pdf.page.width;
        const pageHeight = pdf.page.height;
        const margin = 45;
        const contentWidth = pageWidth - (margin * 2);
        const bottomLimit = pageHeight - 50;

        // Draw initial page background and top accents
        drawPageBackground(pdf, theme, pageWidth, pageHeight);

        const checkPageBreak = (neededHeight = 30) => {
          if (pdf.y + neededHeight > bottomLimit) {
            pdf.addPage();
            drawPageBackground(pdf, theme, pageWidth, pageHeight);
            pdf.y = margin + 10;
            return true;
          }
          return false;
        };

        // 1. Header / Title Block
        drawHeaderBlock(pdf, doc, theme, margin, contentWidth);

        // 2. Executive Summary Block (ONLY if explicitly provided)
        if (doc.executiveSummary && doc.executiveSummary.trim()) {
          drawExecutiveSummary(pdf, doc.executiveSummary, theme, margin, contentWidth, checkPageBreak);
        }

        // 3. Document Sections (Headings, Subheadings, Paragraphs, Bullets, Steps, Tables, Code, Callouts)
        if (Array.isArray(doc.sections)) {
          doc.sections.forEach((section, idx) => {
            drawSection(pdf, section, idx, theme, margin, contentWidth, checkPageBreak, bottomLimit, pageWidth, pageHeight);
          });
        }

        // 4. Global Footers & Page Numbering across all buffered pages
        drawGlobalFooters(pdf, doc, theme, margin, contentWidth, pageHeight, pageWidth);

        pdf.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

/**
 * Draws the page background canvas and decorative accents for each theme.
 */
function drawPageBackground(pdf, theme, pageWidth, pageHeight) {
  pdf.save();

  // 1. Theme-specific background color fill
  if (theme.background && theme.background !== '#FFFFFF') {
    pdf.rect(0, 0, pageWidth, pageHeight).fill(theme.background);
  }

  // 2. Theme 5 (aurora_neon): Corner Peach Aura Bubble in top-right
  if (theme.id === 'aurora_neon') {
    pdf.save();
    pdf.ellipse(pageWidth + 20, -20, 120, 90).fill('#FFE4E8');
    pdf.restore();
  }

  pdf.restore();
}

/**
 * Draws multi-color striped ribbon bar.
 */
function drawStripedRibbon(pdf, x, y, width, height, colors) {
  pdf.save();
  const segmentWidth = 14;
  let currentX = x;
  let colorIdx = 0;
  while (currentX < x + width) {
    const w = Math.min(segmentWidth, x + width - currentX);
    pdf.rect(currentX, y, w, height).fill(colors[colorIdx % colors.length]);
    currentX += segmentWidth;
    colorIdx++;
  }
  pdf.restore();
}

/**
 * Draws dotted horizontal line.
 */
function drawDottedLine(pdf, startX, startY, endX, color, dotRadius = 1.2, gap = 4.5) {
  pdf.save();
  pdf.fillColor(color);
  for (let cx = startX; cx <= endX; cx += gap) {
    pdf.circle(cx, startY, dotRadius).fill();
  }
  pdf.restore();
}

/**
 * Draws dashed horizontal line.
 */
function drawDashedLine(pdf, startX, startY, endX, color, lineWidth = 1, dashLen = 4, spaceLen = 3) {
  pdf.save();
  pdf.strokeColor(color).lineWidth(lineWidth).dash(dashLen, { space: spaceLen });
  pdf.moveTo(startX, startY).lineTo(endX, startY).stroke();
  pdf.undash();
  pdf.restore();
}

/**
 * 1. Title / Header Block
 */
function drawHeaderBlock(pdf, doc, theme, margin, contentWidth) {
  pdf.y = margin + 4;

  const fontHeading = theme.fontHeading || 'Helvetica-Bold';
  const fontBody = theme.fontBody || 'Helvetica';

  if (theme.id === 'retro_pixel') {
    pdf.font(fontHeading).fontSize(20).fillColor('#48A9A6');
    pdf.text(doc.title.toUpperCase(), margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
    pdf.y += 6;

    if (doc.subtitle && doc.subtitle.trim()) {
      pdf.font(fontBody).fontSize(10).fillColor('#555555');
      pdf.text(doc.subtitle.trim(), margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
      pdf.y += 8;
    }
  } else if (theme.id === 'pastel_chic') {
    pdf.font(fontHeading).fontSize(20).fillColor('#7E3FF2');
    pdf.text(doc.title, margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
    pdf.y += 6;

    if (doc.subtitle && doc.subtitle.trim()) {
      pdf.font(fontBody).fontSize(10).fillColor('#2C3E50');
      pdf.text(doc.subtitle.trim(), margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
      pdf.y += 8;
    }
  } else if (theme.id === 'playful_pop') {
    pdf.font(fontHeading).fontSize(20).fillColor('#EF476F');
    pdf.text(doc.title, margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
    pdf.y += 4;

    // Candy-striped ribbon divider bar
    drawStripedRibbon(pdf, margin, pdf.y, contentWidth, 5, ['#FFD166', '#06D6A0', '#EF476F', '#38B6FF']);
    pdf.y += 12;

    if (doc.subtitle && doc.subtitle.trim()) {
      pdf.font(fontBody).fontSize(10).fillColor('#2D3748');
      pdf.text(doc.subtitle.trim(), margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
      pdf.y += 8;
    }
  } else if (theme.id === 'aurora_neon') {
    pdf.font(fontHeading).fontSize(20).fillColor('#5B50D6');
    pdf.text(doc.title, margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
    pdf.y += 4;

    // Hot pink gradient underline
    pdf.save();
    pdf.rect(margin, pdf.y, contentWidth, 3.5).fill('#FF4081');
    pdf.restore();
    pdf.y += 12;

    if (doc.subtitle && doc.subtitle.trim()) {
      pdf.font(fontBody).fontSize(10).fillColor('#2D3748');
      pdf.text(doc.subtitle.trim(), margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
      pdf.y += 8;
    }
  } else {
    // editorial_clean (matching pdf 1.webp)
    pdf.font(fontHeading).fontSize(20).fillColor('#111827');
    pdf.text(doc.title, margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
    pdf.y += 6;

    if (doc.subtitle && doc.subtitle.trim()) {
      pdf.font(fontBody).fontSize(10).fillColor('#374151');
      pdf.text(doc.subtitle.trim(), margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
      pdf.y += 8;
    }
  }

  // Optional Meta bar (only if explicitly provided)
  const metaParts = [];
  if (doc.author) metaParts.push(doc.author);
  if (doc.date) metaParts.push(doc.date);
  if (doc.category) metaParts.push(doc.category);
  if (doc.version && doc.version !== '1.0') metaParts.push(`v${doc.version}`);

  if (metaParts.length > 0) {
    pdf.font(fontBody).fontSize(8.5).fillColor(theme.metaColor || '#6B7280');
    pdf.text(metaParts.join('   •   '), margin, pdf.y, { width: contentWidth });
    pdf.y += 8;
  }

  pdf.y += 6;
}

/**
 * 2. Executive Summary Block (Optional)
 */
function drawExecutiveSummary(pdf, summaryText, theme, margin, contentWidth, checkPageBreak) {
  if (!summaryText || !summaryText.trim()) return;

  const fontBody = theme.fontBody || 'Helvetica';
  pdf.font(fontBody).fontSize(9.5);
  const textHeight = pdf.heightOfString(summaryText, { width: contentWidth - 24, lineGap: 2.5 });
  const boxHeight = textHeight + 20;

  checkPageBreak(boxHeight + 10);
  const startY = pdf.y;

  pdf.save();
  pdf.roundedRect(margin, startY, contentWidth, boxHeight, 4).fill(theme.id === 'retro_pixel' ? '#FFFFFF' : '#F8FAFC');
  pdf.roundedRect(margin, startY, contentWidth, boxHeight, 4).strokeColor(theme.border || '#E2E8F0').lineWidth(0.75).stroke();
  pdf.font(fontBody).fontSize(9.5).fillColor(theme.textPrimary || '#333333').text(summaryText, margin + 12, startY + 10, { width: contentWidth - 24, lineGap: 2.5 });
  pdf.restore();

  pdf.y = startY + boxHeight + 12;
}

/**
 * 3. Document Section Rendering
 */
function drawSection(pdf, section, index, theme, margin, contentWidth, checkPageBreak, bottomLimit, pageWidth, pageHeight) {
  const headingText = (section.heading || section.title || `Section ${index + 1}`).replace(/\*\*/g, '').trim();
  const fontHeading = theme.fontHeading || 'Helvetica-Bold';
  const fontBody = theme.fontBody || 'Helvetica';

  if (index > 0) {
    pdf.y += 10;
  }

  // 1. Draw Section Heading (H2 Level) with Keep-With-Next Protection
  if (theme.id === 'retro_pixel') {
    pdf.font(fontHeading).fontSize(13.5);
    const textH = pdf.heightOfString(headingText.toUpperCase(), { width: contentWidth, lineGap: 2 });
    checkPageBreak(textH + 55);
    const currentY = pdf.y;
    pdf.fillColor('#EB6B56').text(headingText.toUpperCase(), margin, currentY, { width: contentWidth, lineGap: 2 });
    drawDottedLine(pdf, margin, currentY + textH + 4, margin + contentWidth, '#48A9A6', 1.2, 4.5);
    pdf.y = currentY + textH + 10;
  } else if (theme.id === 'pastel_chic') {
    pdf.font(fontHeading).fontSize(11.5);
    const textH = pdf.heightOfString(headingText, { width: contentWidth - 28, lineGap: 2 });
    const pillH = textH + 14;
    checkPageBreak(pillH + 50);
    const currentY = pdf.y;
    pdf.save();
    pdf.roundedRect(margin, currentY, contentWidth, pillH, 14).fill('#FFFFFF');
    pdf.strokeColor('#E3739E').lineWidth(2.5).roundedRect(margin, currentY, contentWidth, pillH, 14).stroke();
    pdf.restore();
    pdf.font(fontHeading).fontSize(11.5).fillColor('#1E1E1E').text(headingText, margin + 14, currentY + 7, { width: contentWidth - 28, lineGap: 2 });
    pdf.y = currentY + pillH + 10;
  } else if (theme.id === 'playful_pop') {
    pdf.font(fontHeading).fontSize(12);
    const textWidth = pdf.widthOfString(headingText.toUpperCase());
    const tagW = Math.min(contentWidth, textWidth + 30);
    const textH = pdf.heightOfString(headingText.toUpperCase(), { width: tagW - 20, lineGap: 2 });
    const tagH = textH + 12;
    checkPageBreak(tagH + 50);
    const currentY = pdf.y;
    pdf.save();
    pdf.roundedRect(margin, currentY, tagW, tagH, 8).fill('#FFD166');
    pdf.restore();
    pdf.font(fontHeading).fontSize(12).fillColor('#00BCD4').text(headingText.toUpperCase(), margin + 10, currentY + 6, { width: tagW - 20, lineGap: 2 });
    pdf.y = currentY + tagH + 10;
  } else if (theme.id === 'aurora_neon') {
    pdf.font(fontHeading).fontSize(13.5);
    const textH = pdf.heightOfString(headingText, { width: contentWidth - 18, lineGap: 2 });
    checkPageBreak(textH + 55);
    const currentY = pdf.y;
    pdf.save();
    pdf.circle(margin + 5, currentY + 7, 5).fill('#06B6D4');
    pdf.circle(margin + 7, currentY + 7, 4).fill('#EC4899');
    pdf.restore();
    pdf.fillColor('#EC4899').text(headingText, margin + 18, currentY, { width: contentWidth - 18, lineGap: 2 });
    pdf.y = currentY + textH + 10;
  } else {
    // editorial_clean (matching reference)
    pdf.font(fontHeading).fontSize(13.5);
    const textH = pdf.heightOfString(headingText, { width: contentWidth, lineGap: 2 });
    checkPageBreak(textH + 55);
    const currentY = pdf.y;
    pdf.fillColor('#111827').text(headingText, margin, currentY, { width: contentWidth, lineGap: 2 });
    pdf.save();
    pdf.strokeColor('#E5E7EB').lineWidth(0.75).moveTo(margin, currentY + textH + 4).lineTo(margin + contentWidth, currentY + textH + 4).stroke();
    pdf.restore();
    pdf.y = currentY + textH + 10;
  }

  // -------------------------------------------------------------
  // 2. Subheading (H3 Level)
  // -------------------------------------------------------------
  if (section.subheading && section.subheading.trim()) {
    drawSubheading(pdf, section.subheading.trim(), theme, margin, contentWidth, checkPageBreak);
  }

  // -------------------------------------------------------------
  // 3. Paragraphs
  // -------------------------------------------------------------
  if (Array.isArray(section.paragraphs)) {
    section.paragraphs.forEach(paragraph => {
      if (!paragraph || !paragraph.trim()) return;
      const cleanParagraph = paragraph.replace(/\*\*/g, '').trim();
      pdf.font(fontBody).fontSize(9.5);
      const pHeight = pdf.heightOfString(cleanParagraph, { width: contentWidth, lineGap: 2.8 });
      checkPageBreak(pHeight + 6);
      pdf.fillColor(theme.textPrimary || '#1F2937').text(cleanParagraph, margin, pdf.y, { width: contentWidth, lineGap: 2.8 });
      pdf.y += 6;
    });
  }

  // -------------------------------------------------------------
  // 4. Bullet Points
  // -------------------------------------------------------------
  if (Array.isArray(section.bulletPoints) && section.bulletPoints.length > 0) {
    drawBulletPoints(pdf, section.bulletPoints, theme, margin, contentWidth, checkPageBreak);
  }

  // -------------------------------------------------------------
  // 5. Numbered Steps
  // -------------------------------------------------------------
  if (Array.isArray(section.numberedSteps) && section.numberedSteps.length > 0) {
    drawNumberedSteps(pdf, section.numberedSteps, theme, margin, contentWidth, checkPageBreak);
  }

  // -------------------------------------------------------------
  // 6. Subsections (if any)
  // -------------------------------------------------------------
  if (Array.isArray(section.subsections) && section.subsections.length > 0) {
    section.subsections.forEach(sub => {
      const subTitle = (sub.heading || sub.subheading || '').trim();
      if (subTitle) {
        drawSubheading(pdf, subTitle, theme, margin, contentWidth, checkPageBreak);
      }
      if (Array.isArray(sub.paragraphs)) {
        sub.paragraphs.forEach(paragraph => {
          if (!paragraph || !paragraph.trim()) return;
          const cleanParagraph = paragraph.replace(/\*\*/g, '').trim();
          pdf.font(fontBody).fontSize(9.5);
          const pHeight = pdf.heightOfString(cleanParagraph, { width: contentWidth, lineGap: 2.5 });
          checkPageBreak(pHeight + 6);
          pdf.fillColor(theme.textPrimary || '#1F2937').text(cleanParagraph, margin, pdf.y, { width: contentWidth, lineGap: 2.5 });
          pdf.y += 6;
        });
      }
      if (Array.isArray(sub.bulletPoints) && sub.bulletPoints.length > 0) {
        drawBulletPoints(pdf, sub.bulletPoints, theme, margin, contentWidth, checkPageBreak);
      }
      if (Array.isArray(sub.numberedSteps) && sub.numberedSteps.length > 0) {
        drawNumberedSteps(pdf, sub.numberedSteps, theme, margin, contentWidth, checkPageBreak);
      }
      if (sub.table && Array.isArray(sub.table.headers) && Array.isArray(sub.table.rows)) {
        drawTable(pdf, sub.table, theme, margin, contentWidth, checkPageBreak, bottomLimit, pageWidth, pageHeight);
      }
      if (sub.callout && (sub.callout.text || sub.callout.title)) {
        drawCalloutBox(pdf, sub.callout, theme, margin, contentWidth, checkPageBreak);
      }
      if (sub.code && sub.code.code) {
        drawCodeBlock(pdf, sub.code, theme, margin, contentWidth, checkPageBreak);
      }
      if (sub.visual && typeof sub.visual === 'object') {
        drawVisualElement(pdf, sub.visual, theme, margin, contentWidth, checkPageBreak);
      }
    });
  }

  // -------------------------------------------------------------
  // 7. Callout Box
  // -------------------------------------------------------------
  if (section.callout && (section.callout.text || section.callout.title)) {
    drawCalloutBox(pdf, section.callout, theme, margin, contentWidth, checkPageBreak);
  }

  // -------------------------------------------------------------
  // 8. Code Block
  // -------------------------------------------------------------
  if (section.code && section.code.code) {
    drawCodeBlock(pdf, section.code, theme, margin, contentWidth, checkPageBreak);
  }

  // -------------------------------------------------------------
  // 9. Visual Element (diagram / chart)
  // -------------------------------------------------------------
  if (section.visual && typeof section.visual === 'object') {
    drawVisualElement(pdf, section.visual, theme, margin, contentWidth, checkPageBreak);
  }

  // -------------------------------------------------------------
  // 10. Table
  // -------------------------------------------------------------
  if (section.table && Array.isArray(section.table.headers) && Array.isArray(section.table.rows)) {
    drawTable(pdf, section.table, theme, margin, contentWidth, checkPageBreak, bottomLimit, pageWidth, pageHeight);
  }

  pdf.y += 8;
}

/**
 * Draws Subheading with theme-specific styling and explicit Y tracking.
 */
function drawSubheading(pdf, subheadingText, theme, margin, contentWidth, checkPageBreak) {
  const fontHeading = theme.fontHeading || 'Helvetica-Bold';
  const cleanSubheading = (subheadingText || '').replace(/\*\*/g, '').trim();

  if (theme.id === 'pastel_chic') {
    pdf.font(fontHeading).fontSize(9.5);
    const textW = Math.min(pdf.widthOfString(cleanSubheading) + 20, contentWidth);
    const textH = pdf.heightOfString(cleanSubheading, { width: textW - 20 });
    const badgeH = Math.max(20, textH + 8);
    checkPageBreak(badgeH + 35);
    const startY = pdf.y;

    pdf.save();
    pdf.roundedRect(margin, startY, textW, badgeH, 10).fill('#7E3FF2');
    pdf.font(fontHeading).fontSize(9.5).fillColor('#FFFFFF').text(cleanSubheading, margin + 10, startY + 5, { width: textW - 20, lineBreak: false });
    pdf.restore();

    pdf.y = startY + badgeH + 8;
  } else if (theme.id === 'retro_pixel') {
    pdf.font(fontHeading).fontSize(11);
    const subH = pdf.heightOfString(cleanSubheading.toUpperCase(), { width: contentWidth, lineGap: 2 });
    checkPageBreak(subH + 35);
    const startY = pdf.y;
    pdf.fillColor(theme.h3Color || '#E5B842').text(cleanSubheading.toUpperCase(), margin, startY, { width: contentWidth, lineGap: 2 });
    pdf.y = startY + subH + 6;
  } else if (theme.id === 'playful_pop') {
    pdf.font(fontHeading).fontSize(11);
    const subH = pdf.heightOfString(cleanSubheading, { width: contentWidth, lineGap: 2 });
    checkPageBreak(subH + 35);
    const startY = pdf.y;
    pdf.fillColor(theme.h3Color || '#EF476F').text(cleanSubheading, margin, startY, { width: contentWidth, lineGap: 2 });
    pdf.y = startY + subH + 6;
  } else if (theme.id === 'aurora_neon') {
    pdf.font(fontHeading).fontSize(11);
    const subH = pdf.heightOfString(cleanSubheading, { width: contentWidth, lineGap: 2 });
    checkPageBreak(subH + 35);
    const startY = pdf.y;
    pdf.fillColor('#EC4899').text(cleanSubheading, margin, startY, { width: contentWidth, lineGap: 2 });
    drawDashedLine(pdf, margin, startY + subH + 3, margin + Math.min(220, contentWidth), '#F472B6', 1.2, 4, 3);
    pdf.y = startY + subH + 8;
  } else {
    pdf.font(fontHeading).fontSize(10.5);
    const subH = pdf.heightOfString(cleanSubheading, { width: contentWidth, lineGap: 2 });
    checkPageBreak(subH + 35);
    const startY = pdf.y;
    pdf.fillColor(theme.h3Color || '#1F2937').text(cleanSubheading, margin, startY, { width: contentWidth, lineGap: 2 });
    pdf.y = startY + subH + 6;
  }
}

/**
 * Draws Bullet Points matching each theme
 */
function drawBulletPoints(pdf, bulletPoints, theme, margin, contentWidth, checkPageBreak) {
  const fontBody = theme.fontBody || 'Helvetica';
  const bulletIndent = 14;
  const bulletWidth = contentWidth - bulletIndent;

  bulletPoints.forEach((bullet, bIdx) => {
    if (!bullet || !bullet.trim()) return;
    const cleanBullet = bullet.trim().replace(/\*\*/g, '');

    pdf.font(fontBody).fontSize(9.5);
    const bHeight = pdf.heightOfString(cleanBullet, { width: bulletWidth, lineGap: 2.5 });
    checkPageBreak(bHeight + 5);

    const curY = pdf.y;

    pdf.save();
    if (theme.id === 'retro_pixel') {
      pdf.rect(margin + 2, curY + 3, 4, 4).fill('#48A9A6');
    } else if (theme.id === 'pastel_chic') {
      pdf.circle(margin + 5, curY + 5, 2.5).fill('#E3739E');
    } else if (theme.id === 'playful_pop') {
      const colors = ['#FFD166', '#06D6A0', '#EF476F', '#38B6FF'];
      pdf.circle(margin + 5, curY + 5, 2.5).fill(colors[bIdx % colors.length]);
    } else if (theme.id === 'aurora_neon') {
      pdf.circle(margin + 5, curY + 5, 2.5).fill('#FF4081');
    } else {
      pdf.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('•', margin + 2, curY, { lineBreak: false });
    }
    pdf.restore();

    pdf.font(fontBody)
      .fontSize(9.5)
      .fillColor(theme.textPrimary || '#333333')
      .text(cleanBullet, margin + bulletIndent, curY, { width: bulletWidth, lineGap: 2.5 });

    pdf.y += 4;
  });

  pdf.y += 4;
}

/**
 * Draws Numbered Steps matching each theme
 */
function drawNumberedSteps(pdf, numberedSteps, theme, margin, contentWidth, checkPageBreak) {
  const fontBody = theme.fontBody || 'Helvetica';
  const numIndent = 20;
  const stepWidth = contentWidth - numIndent;

  numberedSteps.forEach((step, sIdx) => {
    if (!step || !step.trim()) return;
    const cleanStep = step.trim().replace(/\*\*/g, '');

    pdf.font(fontBody).fontSize(9.5);
    const sHeight = pdf.heightOfString(cleanStep, { width: stepWidth, lineGap: 2.5 });
    checkPageBreak(sHeight + 5);

    const curY = pdf.y;

    pdf.save();
    if (theme.id === 'retro_pixel') {
      pdf.font('Courier-Bold').fontSize(9).fillColor('#EB6B56').text(`[${sIdx + 1}]`, margin, curY, { lineBreak: false });
    } else if (theme.id === 'pastel_chic') {
      pdf.roundedRect(margin, curY + 1, 15, 14, 7).fill('#7E3FF2');
      pdf.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(String(sIdx + 1), margin + 4.5, curY + 3.5, { lineBreak: false });
    } else if (theme.id === 'playful_pop') {
      pdf.roundedRect(margin, curY + 1, 15, 14, 4).fill('#FFD166');
      pdf.font('Helvetica-Bold').fontSize(8).fillColor('#00BCD4').text(String(sIdx + 1), margin + 4.5, curY + 3.5, { lineBreak: false });
    } else if (theme.id === 'aurora_neon') {
      pdf.roundedRect(margin, curY + 1, 15, 14, 3).fill('#06B6D4');
      pdf.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(String(sIdx + 1), margin + 4.5, curY + 3.5, { lineBreak: false });
    } else {
      pdf.font('Helvetica').fontSize(9.5).fillColor('#111827').text(`${sIdx + 1}.`, margin + 2, curY, { lineBreak: false });
    }
    pdf.restore();

    pdf.font(fontBody)
      .fontSize(9.5)
      .fillColor(theme.textPrimary || '#333333')
      .text(cleanStep, margin + (theme.id === 'editorial_clean' ? 16 : numIndent), curY, { width: contentWidth - (theme.id === 'editorial_clean' ? 16 : numIndent), lineGap: 2.5 });

    pdf.y += 4;
  });

  pdf.y += 4;
}

/**
 * Draws Callout Box matching each theme
 */
function drawCalloutBox(pdf, callout, theme, margin, contentWidth, checkPageBreak) {
  const calloutTitle = (callout.title || '').replace(/\*\*/g, '').trim();
  const calloutText = (callout.text || '').replace(/\*\*/g, '').trim();
  if (!calloutText && !calloutTitle) return;

  const fontBody = theme.fontBody || 'Helvetica';
  const fontHeading = theme.fontHeading || 'Helvetica-Bold';
  const isHighlight = callout.type === 'highlight' || callout.type === 'takeaway' || callout.type === 'tip' || callout.type === 'important';

  const padX = 14;
  const innerWidth = contentWidth - (padX * 2);

  // Measure title height
  pdf.font(fontHeading).fontSize(9);
  const titleH = calloutTitle ? pdf.heightOfString(calloutTitle.toUpperCase(), { width: innerWidth, lineGap: 1.5 }) + 4 : 0;

  // Measure body text height
  pdf.font(fontBody).fontSize(9.5);
  const textH = pdf.heightOfString(calloutText, { width: innerWidth, lineGap: 2 });

  const boxHeight = titleH + textH + 18;
  checkPageBreak(boxHeight + 10);

  const startY = pdf.y + 2;

  if (theme.id === 'retro_pixel') {
    pdf.save();
    const bg = isHighlight ? '#F3C969' : '#1E1E1E';
    const border = isHighlight ? '#D67BD8' : '#EB6B56';
    const tColor = isHighlight ? '#EB6B56' : '#5CBDB9';
    const bodyColor = isHighlight ? '#222222' : '#E0E0E0';

    pdf.roundedRect(margin, startY, contentWidth, boxHeight, 8).fill(bg);
    pdf.roundedRect(margin, startY, contentWidth, boxHeight, 8).strokeColor(border).lineWidth(2).stroke();

    let textY = startY + 8;
    if (calloutTitle) {
      pdf.font('Courier-Bold').fontSize(9).fillColor(tColor).text(calloutTitle.toUpperCase(), margin + padX, textY, { width: innerWidth });
      textY += titleH;
    }
    pdf.font('Courier').fontSize(9.5).fillColor(bodyColor).text(calloutText, margin + padX, textY, { width: innerWidth, lineGap: 2 });
    pdf.restore();
  } else if (theme.id === 'pastel_chic') {
    pdf.save();
    if (isHighlight) {
      pdf.roundedRect(margin, startY, contentWidth, boxHeight, 4).fill('#E6ECFA');
      pdf.rect(margin, startY, 5, boxHeight).fill('#7E3FF2');
      let textY = startY + 8;
      if (calloutTitle) {
        pdf.font('Helvetica-Bold').fontSize(9).fillColor('#7E3FF2').text(calloutTitle, margin + padX + 2, textY, { width: innerWidth - 2 });
        textY += titleH;
      }
      pdf.font(fontBody).fontSize(9.5).fillColor('#2C3E50').text(calloutText, margin + padX + 2, textY, { width: innerWidth - 2, lineGap: 2 });
    } else {
      pdf.roundedRect(margin, startY, contentWidth, boxHeight, 14).fill('#E3739E');
      let textY = startY + 8;
      if (calloutTitle) {
        const badgeW = Math.min(innerWidth, pdf.widthOfString(calloutTitle) + 20);
        pdf.roundedRect(margin + padX, textY - 2, badgeW, 18, 6).fill('#7E3FF2');
        pdf.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF').text(calloutTitle, margin + padX + 8, textY + 2, { lineBreak: false });
        textY += 22;
      }
      pdf.font(fontBody).fontSize(9.5).fillColor('#FFFFFF').text(calloutText, margin + padX, textY, { width: innerWidth, lineGap: 2 });
    }
    pdf.restore();
  } else if (theme.id === 'playful_pop') {
    pdf.save();
    if (isHighlight) {
      pdf.roundedRect(margin, startY, contentWidth, boxHeight, 10).fill('#EF476F');
      pdf.strokeColor('#FFD166').lineWidth(2).dash(4, { space: 3 });
      pdf.roundedRect(margin, startY, contentWidth, boxHeight, 10).stroke();
      pdf.undash();
      let textY = startY + 8;
      if (calloutTitle) {
        pdf.font('Helvetica-Bold').fontSize(9).fillColor('#FFD166').text(calloutTitle.toUpperCase(), margin + padX, textY, { width: innerWidth });
        textY += titleH;
      }
      pdf.font(fontBody).fontSize(9.5).fillColor('#FFFFFF').text(calloutText, margin + padX, textY, { width: innerWidth, lineGap: 2 });
    } else {
      pdf.roundedRect(margin, startY, contentWidth, boxHeight, 10).fill('#FFFFFF');
      pdf.roundedRect(margin, startY, contentWidth, boxHeight, 10).strokeColor('#38B6FF').lineWidth(2).stroke();
      let textY = startY + 8;
      if (calloutTitle) {
        pdf.font('Helvetica-Bold').fontSize(9).fillColor('#EF476F').text(calloutTitle.toUpperCase(), margin + padX, textY, { width: innerWidth });
        textY += titleH;
      }
      pdf.font(fontBody).fontSize(9.5).fillColor('#2D3748').text(calloutText, margin + padX, textY, { width: innerWidth, lineGap: 2 });
    }
    pdf.restore();
  } else if (theme.id === 'aurora_neon') {
    pdf.save();
    if (isHighlight) {
      pdf.roundedRect(margin, startY, contentWidth, boxHeight, 8).fill('#FDF2F8');
      pdf.roundedRect(margin, startY, 4.5, boxHeight, 2).fill('#BE185D');
      let textY = startY + 8;
      if (calloutTitle) {
        pdf.font('Helvetica-Bold').fontSize(9).fillColor('#BE185D').text(calloutTitle, margin + padX + 2, textY, { width: innerWidth - 2 });
        textY += titleH;
      }
      pdf.font(fontBody).fontSize(9.5).fillColor('#1F2937').text(calloutText, margin + padX + 2, textY, { width: innerWidth - 2, lineGap: 2 });
    } else {
      pdf.roundedRect(margin, startY, contentWidth, boxHeight, 8).fill('#06B6D4');
      pdf.rect(margin, startY, 4.5, boxHeight).fill('#FF4081');
      let textY = startY + 8;
      if (calloutTitle) {
        pdf.font('Helvetica-Bold').fontSize(9).fillColor('#FFE4E8').text(calloutTitle.toUpperCase(), margin + padX + 4, textY, { width: innerWidth - 4 });
        textY += titleH;
      }
      pdf.font(fontBody).fontSize(9.5).fillColor('#FFFFFF').text(calloutText, margin + padX + 4, textY, { width: innerWidth - 4, lineGap: 2 });
    }
    pdf.restore();
  } else {
    // editorial_clean (matching pdf 1.webp)
    pdf.save();
    pdf.roundedRect(margin, startY, contentWidth, boxHeight, 4).fill('#F8FAFC');
    pdf.roundedRect(margin, startY, contentWidth, boxHeight, 4).strokeColor('#E2E8F0').lineWidth(0.75).stroke();

    let textY = startY + 8;
    if (calloutTitle) {
      pdf.font(fontHeading).fontSize(9).fillColor('#0F172A').text(calloutTitle.toUpperCase(), margin + padX, textY, { width: innerWidth });
      textY += titleH;
    }
    pdf.font(fontBody).fontSize(9.5).fillColor('#333333').text(calloutText, margin + padX, textY, { width: innerWidth, lineGap: 2 });
    pdf.restore();
  }

  pdf.y = startY + boxHeight + 8;
}

/**
 * Draws Table with theme-specific styling and intelligent multi-page pagination.
 */
function drawTable(pdf, table, theme, margin, contentWidth, checkPageBreak, bottomLimit, pageWidth, pageHeight) {
  const headers = (table.headers || []).map(h => String(h).replace(/\*\*/g, '').trim());
  const rows = table.rows || [];
  if (headers.length === 0 || rows.length === 0) return;

  const tConfig = theme.table || {};
  const colCount = headers.length;
  const colWidth = contentWidth / colCount;
  const colWidths = new Array(colCount).fill(colWidth);
  const cellPadding = 6;
  const fontBody = theme.fontBody || 'Helvetica';
  const fontBodyBold = theme.fontBodyBold || 'Helvetica-Bold';

  const getColX = (colIdx) => margin + (colIdx * colWidth);

  // 1. Table Title (if present)
  if (table.title && table.title.trim()) {
    checkPageBreak(24);
    pdf.font(fontBodyBold).fontSize(9.5).fillColor(theme.textPrimary || '#111827').text(table.title.replace(/\*\*/g, '').trim(), margin, pdf.y);
    pdf.y += 4;
  }

  // 2. Measure Header Row Height
  pdf.font(fontBodyBold).fontSize(8.5);
  let maxHeaderHeight = 12;
  headers.forEach((h, colIdx) => {
    const colW = colWidths[colIdx];
    const hHeight = pdf.heightOfString(String(h || '').replace(/\*\*/g, ''), { width: colW - (cellPadding * 2), lineGap: 2 });
    if (hHeight > maxHeaderHeight) maxHeaderHeight = hHeight;
  });
  const headerHeight = maxHeaderHeight + (cellPadding * 2);

  // Function to render the table header row
  const renderHeaderRow = (headerY) => {
    pdf.save();
    pdf.rect(margin, headerY, contentWidth, headerHeight).fill(tConfig.headerBg || '#F1F5F9');
    pdf.strokeColor(tConfig.border || '#E2E8F0').lineWidth(0.75).rect(margin, headerY, contentWidth, headerHeight).stroke();
    pdf.restore();

    pdf.font(fontBodyBold).fontSize(8.5).fillColor(tConfig.headerText || '#0F172A');
    headers.forEach((h, colIdx) => {
      const colX = getColX(colIdx);
      const colW = colWidths[colIdx];
      pdf.text(
        String(h || '').replace(/\*\*/g, ''),
        colX + cellPadding,
        headerY + cellPadding,
        { width: colW - (cellPadding * 2), align: 'left', lineGap: 2 }
      );
    });
  };

  // Ensure header + at least 1 row fits before starting table on current page
  checkPageBreak(headerHeight + 25);

  let headerY = pdf.y;
  renderHeaderRow(headerY);

  pdf.y = headerY + headerHeight;
  let currentY = pdf.y;

  // 3. Draw Data Rows with seamless page continuation
  rows.forEach((row, rowIdx) => {
    pdf.font(fontBody).fontSize(8.5);
    let maxCellHeight = 12;
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      const cellValue = String(row[colIdx] || '').replace(/\*\*/g, '');
      const colW = colWidths[colIdx];
      const h = pdf.heightOfString(cellValue, { width: colW - (cellPadding * 2), lineGap: 2 });
      if (h > maxCellHeight) maxCellHeight = h;
    }

    const dynamicRowHeight = maxCellHeight + (cellPadding * 2);

    // If current row exceeds bottom limit, split to new page and re-render header!
    if (pdf.y + dynamicRowHeight > bottomLimit) {
      pdf.addPage();
      drawPageBackground(pdf, theme, pageWidth, pageHeight);
      pdf.y = margin + 10;
      headerY = pdf.y;
      renderHeaderRow(headerY);
      pdf.y = headerY + headerHeight;
      currentY = pdf.y;
    }

    currentY = pdf.y;
    const rowBg = (rowIdx % 2 === 0) ? (tConfig.rowBg1 || '#FFFFFF') : (tConfig.rowBg2 || '#F8FAFC');

    pdf.save();
    pdf.rect(margin, currentY, contentWidth, dynamicRowHeight).fill(rowBg);
    // Horizontal row divider line
    pdf.strokeColor(tConfig.border || '#E2E8F0').lineWidth(0.5).moveTo(margin, currentY + dynamicRowHeight).lineTo(margin + contentWidth, currentY + dynamicRowHeight).stroke();
    // Vertical side borders
    pdf.strokeColor(tConfig.border || '#E2E8F0').lineWidth(0.75).moveTo(margin, currentY).lineTo(margin, currentY + dynamicRowHeight).stroke();
    pdf.strokeColor(tConfig.border || '#E2E8F0').lineWidth(0.75).moveTo(margin + contentWidth, currentY).lineTo(margin + contentWidth, currentY + dynamicRowHeight).stroke();
    pdf.restore();

    pdf.font(fontBody).fontSize(8.5).fillColor(tConfig.textColor || '#334155');
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      const cellValue = String(row[colIdx] || '').replace(/\*\*/g, '');
      const colX = getColX(colIdx);
      const colW = colWidths[colIdx];
      pdf.text(
        cellValue,
        colX + cellPadding,
        currentY + cellPadding,
        { width: colW - (cellPadding * 2), align: 'left', lineGap: 2 }
      );
    }

    currentY += dynamicRowHeight;
    pdf.y = currentY;
  });

  pdf.y = currentY + 8;
}

/**
 * Draws Code Block with dark theme container.
 */
function drawCodeBlock(pdf, codeObj, theme, margin, contentWidth, checkPageBreak) {
  let code = codeObj.code || '';
  // Sanitize non-standard / smart quotes and characters for standard Courier font
  code = String(code)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\t/g, '  ')
    .replace(/[\u00A0]/g, ' ')
    .replace(/[^\x00-\x7F]/g, '');

  const lang = (codeObj.language || 'code').toUpperCase();
  const title = codeObj.title ? `${codeObj.title} (${lang})` : lang;

  pdf.font('Courier').fontSize(8.5);
  const codeHeight = pdf.heightOfString(code, { width: contentWidth - 20, lineGap: 2 });
  const blockHeight = codeHeight + 28;

  checkPageBreak(blockHeight + 10);

  const startY = pdf.y + 2;
  pdf.save();
  pdf.roundedRect(margin, startY, contentWidth, blockHeight, 4).fill('#0F172A');
  pdf.font('Helvetica-Bold').fontSize(7.5).fillColor('#94A3B8').text(title, margin + 10, startY + 6);
  pdf.font('Courier').fontSize(8.5).fillColor('#E2E8F0').text(code, margin + 10, startY + 18, { width: contentWidth - 20, lineGap: 2 });
  pdf.restore();

  pdf.y = startY + blockHeight + 8;
}

/**
 * Draws Visual Diagram or Flowchart with vector arrows.
 */
function drawVisualElement(pdf, visual, theme, margin, contentWidth, checkPageBreak) {
  const vType = (visual.type || '').toLowerCase();

  if (vType === 'diagram' && Array.isArray(visual.nodes)) {
    const nodes = visual.nodes.slice(0, 4);
    const count = nodes.length;
    if (count === 0) return;

    const gap = 16;
    const nodeWidth = (contentWidth - ((count - 1) * gap)) / count;
    const fontBody = theme.fontBody || 'Helvetica';
    const fontBodyBold = theme.fontBodyBold || 'Helvetica-Bold';

    // Calculate dynamic node height
    pdf.font(fontBody).fontSize(7.5);
    let maxDescHeight = 12;
    nodes.forEach(node => {
      if (node.description) {
        const h = pdf.heightOfString(node.description.replace(/\*\*/g, ''), { width: nodeWidth - 8, lineGap: 1.5 });
        if (h > maxDescHeight) maxDescHeight = h;
      }
    });
    const nodeHeight = Math.max(44, maxDescHeight + 24);

    checkPageBreak(nodeHeight + (visual.title ? 35 : 20));
    const startY = pdf.y + 2;

    if (visual.title) {
      pdf.font(fontBodyBold).fontSize(9.5).fillColor(theme.primary || '#1F2937').text(visual.title.replace(/\*\*/g, ''), margin, startY);
      pdf.y += 14;
    }

    const currentY = pdf.y + 2;

    nodes.forEach((node, i) => {
      const nodeX = margin + (i * (nodeWidth + gap));
      pdf.save();
      pdf.roundedRect(nodeX, currentY, nodeWidth, nodeHeight, 4).fill(theme.neutralLight || '#F8FAFC');
      pdf.roundedRect(nodeX, currentY, nodeWidth, nodeHeight, 4).strokeColor(theme.border || '#E2E8F0').lineWidth(0.75).stroke();
      pdf.roundedRect(nodeX, currentY, nodeWidth, 3, 1).fill(theme.accent || '#111827');

      pdf.font(fontBodyBold).fontSize(8.5).fillColor(theme.primary || '#1F2937').text((node.label || `Node ${i + 1}`).replace(/\*\*/g, ''), nodeX + 4, currentY + 7, { width: nodeWidth - 8, align: 'center', lineBreak: false });
      if (node.description) {
        pdf.font(fontBody).fontSize(7.5).fillColor(theme.neutralMuted || '#6B7280').text(node.description.replace(/\*\*/g, ''), nodeX + 4, currentY + 18, { width: nodeWidth - 8, align: 'center', lineGap: 1.5 });
      }
      pdf.restore();

      // Draw clean vector arrow between nodes
      if (i < count - 1) {
        const arrowStartX = nodeX + nodeWidth + 2;
        const arrowEndX = nodeX + nodeWidth + gap - 2;
        const arrowY = currentY + (nodeHeight / 2);
        pdf.save();
        pdf.strokeColor(theme.border || '#94A3B8').lineWidth(1.2);
        pdf.moveTo(arrowStartX, arrowY).lineTo(arrowEndX, arrowY).stroke();
        pdf.polygon([arrowEndX, arrowY], [arrowEndX - 3.5, arrowY - 2.5], [arrowEndX - 3.5, arrowY + 2.5]).fill(theme.border || '#94A3B8');
        pdf.restore();
      }
    });

    pdf.y = currentY + nodeHeight + 8;
  }
}

/**
 * Global Footers & Page Numbers
 */
function drawGlobalFooters(pdf, doc, theme, margin, contentWidth, pageHeight, pageWidth) {
  const range = pdf.bufferedPageRange();
  const totalPages = range.count;
  const fontBody = theme.fontBody || 'Helvetica';

  for (let i = range.start; i < range.start + totalPages; i++) {
    pdf.switchToPage(i);
    const oldBottom = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    const footerY = pageHeight - 28;

    pdf.save();

    if (theme.id === 'retro_pixel') {
      drawDottedLine(pdf, margin, footerY - 6, margin + contentWidth, '#CCCCCC', 1, 5);
    } else {
      pdf.strokeColor(theme.dividerColor || theme.border || '#E2E8F0')
        .lineWidth(0.5)
        .moveTo(margin, footerY - 6)
        .lineTo(margin + contentWidth, footerY - 6)
        .stroke();
    }

    const footerTitle = doc.title || '';
    pdf.font(fontBody)
      .fontSize(8)
      .fillColor(theme.metaColor || '#6B7280')
      .text(footerTitle, margin, footerY, { width: contentWidth * 0.7, lineBreak: false });

    const pageText = theme.id === 'retro_pixel'
      ? `[ PAGE ${i + 1} / ${totalPages} ]`
      : `Page ${i + 1} of ${totalPages}`;

    pdf.font(fontBody)
      .fontSize(8)
      .fillColor(theme.metaColor || '#6B7280')
      .text(pageText, margin + (contentWidth * 0.7), footerY, {
        width: contentWidth * 0.3,
        align: 'right',
        lineBreak: false
      });

    pdf.restore();
    pdf.page.margins.bottom = oldBottom;
  }
}
