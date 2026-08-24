/**
 * Presentation Schema & Layout Definitions for PowerPoint (.pptx) generation.
 * Handles theme palette detection, intent classification, schema validation, and text-to-slide repairs.
 */

export const THEME_PALETTES = {
  tech_indigo: {
    name: 'Tech Indigo',
    primary: '4F46E5',
    secondary: '06B6D4',
    accent: '10B981',
    bg: 'F8FAFC',
    cardBg: 'FFFFFF',
    text: '0F172A',
    subtext: '64748B',
    border: 'E2E8F0',
    headerFill: '4F46E5',
    headerText: 'FFFFFF',
    isDark: false
  },
  corporate_blue: {
    name: 'Corporate Blue',
    primary: '1E40AF',
    secondary: '3B82F6',
    accent: '0EA5E9',
    bg: 'F1F5F9',
    cardBg: 'FFFFFF',
    text: '0F172A',
    subtext: '475569',
    border: 'CBD5E1',
    headerFill: '1E40AF',
    headerText: 'FFFFFF',
    isDark: false
  },
  dark_slate: {
    name: 'Dark Slate',
    primary: '38BDF8',
    secondary: '818CF8',
    accent: '34D399',
    bg: '0F172A',
    cardBg: '1E293B',
    text: 'F8FAFC',
    subtext: '94A3B8',
    border: '334155',
    headerFill: '1E293B',
    headerText: '38BDF8',
    isDark: true
  },
  emerald_growth: {
    name: 'Emerald Growth',
    primary: '047857',
    secondary: '10B981',
    accent: 'F59E0B',
    bg: 'F0FDF4',
    cardBg: 'FFFFFF',
    text: '064E3B',
    subtext: '047857',
    border: 'D1FAE5',
    headerFill: '047857',
    headerText: 'FFFFFF',
    isDark: false
  },
  crimson_bold: {
    name: 'Crimson Bold',
    primary: '9F1239',
    secondary: 'E11D48',
    accent: 'FB7185',
    bg: 'FFF1F2',
    cardBg: 'FFFFFF',
    text: '4C0519',
    subtext: '9F1239',
    border: 'FFE4E6',
    headerFill: '9F1239',
    headerText: 'FFFFFF',
    isDark: false
  },
  sunset_amber: {
    name: 'Sunset Amber',
    primary: 'C2410C',
    secondary: 'F97316',
    accent: 'FBBF24',
    bg: 'FFF7ED',
    cardBg: 'FFFFFF',
    text: '431407',
    subtext: '9A3412',
    border: 'FFEDD5',
    headerFill: 'C2410C',
    headerText: 'FFFFFF',
    isDark: false
  },
  modern_minimal: {
    name: 'Modern Minimal',
    primary: '18181B',
    secondary: '52525B',
    accent: '2563EB',
    bg: 'FAFAFA',
    cardBg: 'FFFFFF',
    text: '18181B',
    subtext: '71717A',
    border: 'E4E4E7',
    headerFill: '18181B',
    headerText: 'FFFFFF',
    isDark: false
  },
  cyberpunk: {
    name: 'Cyberpunk Neon',
    primary: '00F0FF',
    secondary: 'FF007A',
    accent: 'FFE600',
    bg: '0D0221',
    cardBg: '190A38',
    text: 'FFFFFF',
    subtext: 'B8B8D2',
    border: '3D1A78',
    headerFill: '190A38',
    headerText: '00F0FF',
    isDark: true
  },
  academic_navy: {
    name: 'Academic Navy',
    primary: '1E3A8A',
    secondary: '475569',
    accent: 'D97706',
    bg: 'F8FAFC',
    cardBg: 'FFFFFF',
    text: '0F172A',
    subtext: '64748B',
    border: 'E2E8F0',
    headerFill: '1E3A8A',
    headerText: 'FFFFFF',
    isDark: false
  },
  monochrome: {
    name: 'Monochrome Black & White',
    primary: '171717',
    secondary: '525252',
    accent: '737373',
    bg: 'FAFAFA',
    cardBg: 'FFFFFF',
    text: '000000',
    subtext: '525252',
    border: 'D4D4D4',
    headerFill: '171717',
    headerText: 'FFFFFF',
    isDark: false
  }
};

export class PresentationSchema {
  /**
   * Detects intent / presentation domain from prompt.
   */
  static detectPresentationType(prompt) {
    const text = (prompt || '').toLowerCase();
    if (/\b(pitch|investor|fundraising|startup|business plan|market size|roi|revenue|financial)\b/i.test(text)) {
      return 'pitch_deck';
    }
    if (/\b(architecture|api|backend|frontend|system design|database|kubernetes|docker|code|devops|microservice)\b/i.test(text)) {
      return 'technical';
    }
    if (/\b(lesson|tutorial|guide|course|learning|student|physics|chemistry|history|school|lecture|explain)\b/i.test(text)) {
      return 'educational';
    }
    if (/\b(marketing|campaign|seo|growth|conversion|social media|brand|sales strategy|funnel)\b/i.test(text)) {
      return 'marketing';
    }
    if (/\b(research|paper|thesis|study|clinical|methodology|hypothesis|academic)\b/i.test(text)) {
      return 'academic';
    }
    if (/\b(metrics|dashboard|analytics|kpi|statistics|data analysis|benchmark|forecast)\b/i.test(text)) {
      return 'analytical';
    }
    if (/\b(strategy|executive|roadmap|qbr|quarterly|leadership|governance|board)\b/i.test(text)) {
      return 'executive';
    }
    return 'business';
  }

  /**
   * Detects requested color palette from user prompt.
   */
  static detectThemePalette(prompt, defaultTheme = 'tech_indigo') {
    const text = (prompt || '').toLowerCase();
    if (/\b(dark|black|night|cyber|neon|matrix)\b/i.test(text)) return 'dark_slate';
    if (/\b(emerald|green|nature|eco|sustainability|growth)\b/i.test(text)) return 'emerald_growth';
    if (/\b(crimson|red|ruby|bold|urgent)\b/i.test(text)) return 'crimson_bold';
    if (/\b(sunset|orange|amber|warm|autumn)\b/i.test(text)) return 'sunset_amber';
    if (/\b(minimal|modern|clean|grayscale|gray|grey)\b/i.test(text)) return 'modern_minimal';
    if (/\b(cyberpunk|purple|violet)\b/i.test(text)) return 'cyberpunk';
    if (/\b(corporate|blue|navy|finance|bank)\b/i.test(text)) return 'corporate_blue';
    if (/\b(academic|university|formal)\b/i.test(text)) return 'academic_navy';
    if (/\b(monochrome|bw|black and white|black & white)\b/i.test(text)) return 'monochrome';
    return defaultTheme;
  }

  /**
   * Validates and normalizes complete Presentation JSON specification.
   */
  static validate(raw, userPrompt = '') {
    if (!raw || typeof raw !== 'object') {
      return this.repairFromText(String(raw || ''), userPrompt);
    }

    const presentationType = raw.presentationType || this.detectPresentationType(userPrompt);
    const themeCandidate = raw.theme || raw.themeColor;
    const themeKey = themeCandidate && THEME_PALETTES[themeCandidate]
      ? themeCandidate
      : this.detectThemePalette(userPrompt, 'tech_indigo');

    const title = (raw.title || 'Executive Presentation').trim();
    const subtitle = (raw.subtitle || 'Overview & Strategic Analysis').trim();
    const author = (raw.author || 'Mark • Personal AI Assistant').trim();
    const date = (raw.date || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })).trim();
    const category = (raw.category || presentationType.toUpperCase()).trim();

    let rawSlides = Array.isArray(raw.slides) ? raw.slides : [];

    // If no slides provided or invalid, build clean default structured slide deck
    if (rawSlides.length === 0) {
      rawSlides = [
        {
          type: 'title',
          title: title,
          subtitle: subtitle,
          category: category,
          author: author,
          date: date
        },
        {
          type: 'text',
          title: 'Executive Briefing',
          content: [
            'Core Objective: Strategic analysis and verified architecture for optimal performance.',
            'Operational Focus: Modular design with zero downtime and low latency.'
          ]
        }
      ];
    }

    // Ensure first slide is a title slide
    const firstSlide = rawSlides[0];
    if (firstSlide && firstSlide.type !== 'title') {
      rawSlides.unshift({
        type: 'title',
        title: title,
        subtitle: subtitle,
        category: category,
        author: author,
        date: date
      });
    }

    // Valid slide types
    const validSlideTypes = [
      'title',
      'section',
      'section_header',
      'text',
      'content',
      'cards',
      'image',
      'text_image',
      'chart',
      'table',
      'comparison',
      'kpi',
      'statistics',
      'process',
      'flowchart',
      'timeline',
      'diagram',
      'architecture',
      'hierarchy',
      'quote',
      'conclusion',
      'takeaways',
      'references'
    ];

    const sanitizedSlides = rawSlides.map((slide, idx) => {
      if (!slide || typeof slide !== 'object') {
        return {
          type: 'text',
          title: `Key Analysis ${idx + 1}`,
          category: category,
          bullets: [String(slide || '')]
        };
      }

      let type = (slide.type || 'text').toLowerCase().trim();

      // Normalize visual object if present
      const visual = slide.visual && typeof slide.visual === 'object' ? slide.visual : null;
      if (visual) {
        const vType = (visual.type || '').toLowerCase();
        if (vType === 'image') {
          type = (slide.content?.length > 0 || slide.bullets?.length > 0) ? 'text_image' : 'image';
          slide.imageQuery = visual.query || slide.imageQuery;
          slide.position = visual.position || slide.position;
        } else if (vType === 'chart') {
          type = 'chart';
          slide.chartType = visual.chartType || slide.chartType;
          slide.data = visual.data || slide.data;
          slide.source = visual.source || slide.source;
        } else if (vType === 'diagram') {
          type = 'diagram';
          slide.diagramType = visual.diagramType || slide.diagramType;
          slide.nodes = visual.nodes || slide.nodes;
          slide.connections = visual.connections || slide.connections;
        } else if (vType === 'table') {
          type = 'table';
          slide.headers = visual.columns || visual.headers || slide.headers;
          slide.rows = visual.rows || slide.rows;
        } else if (vType === 'comparison') {
          type = 'comparison';
          slide.columns = visual.columns || slide.columns;
        } else if (vType === 'process') {
          type = 'process';
          slide.steps = visual.steps || slide.steps;
        } else if (vType === 'timeline') {
          type = 'timeline';
          slide.milestones = visual.milestones || slide.milestones;
        }
      }

      if (!validSlideTypes.includes(type)) {
        if (slide.chartType || slide.data?.series) type = 'chart';
        else if (slide.headers || slide.rows) type = 'table';
        else if (slide.kpis || slide.metrics) type = 'kpi';
        else if (slide.steps || slide.workflow) type = 'process';
        else if (slide.milestones) type = 'timeline';
        else if (slide.columns) type = 'comparison';
        else if (slide.quote) type = 'quote';
        else if (slide.diagramType || slide.nodes) type = 'diagram';
        else type = 'text';
      }

      const slideTitle = (slide.title || (type === 'title' ? title : `Key Analysis ${idx + 1}`)).trim();
      const slideCategory = (slide.category || category).trim();
      const notes = (slide.notes || slide.speakerNotes || slide.purpose || '').trim();

      const normalized = {
        type,
        title: slideTitle,
        category: slideCategory,
        notes: notes || undefined
      };

      // Type-specific field sanitation
      switch (type) {
        case 'title':
          normalized.title = slide.title || title;
          normalized.subtitle = slide.subtitle || subtitle;
          normalized.author = slide.author || author;
          normalized.date = slide.date || date;
          break;

        case 'section':
        case 'section_header':
          normalized.type = 'section_header';
          normalized.sectionNumber = slide.sectionNumber || `0${idx}`;
          normalized.description = slide.description || slide.purpose || 'Detailed domain breakdown and architectural insights.';
          break;

        case 'text':
        case 'content':
        case 'cards':
          normalized.type = 'text';
          if (Array.isArray(slide.content) && slide.content.length > 0) {
            normalized.bullets = slide.content.map(b => String(b).trim()).filter(Boolean).slice(0, 5);
          } else if (Array.isArray(slide.bullets) && slide.bullets.length > 0) {
            normalized.bullets = slide.bullets.map(b => String(b).trim()).filter(Boolean).slice(0, 5);
          } else if (Array.isArray(slide.cards) && slide.cards.length > 0) {
            normalized.cards = slide.cards.map(c => ({
              title: (c.title || 'Focus Area').trim(),
              description: (c.description || c.text || '').trim()
            })).slice(0, 3);
          } else {
            normalized.bullets = [
              slide.description || slide.text || 'High-impact strategic insight and technical execution.'
            ];
          }
          break;

        case 'text_image':
          normalized.bullets = Array.isArray(slide.content) && slide.content.length > 0
            ? slide.content.map(b => String(b).trim()).slice(0, 4)
            : (Array.isArray(slide.bullets) ? slide.bullets.map(b => String(b).trim()).slice(0, 4) : ['Key functional workflow and structural architecture.']);
          normalized.imageQuery = slide.imageQuery || slide.imagePrompt || visual?.query || slide.title;
          normalized.position = slide.position || visual?.position || 'right';
          normalized.imageUrl = slide.imageUrl || undefined;
          normalized.caption = slide.caption || slide.callout || undefined;
          break;

        case 'image':
          normalized.imageQuery = slide.imageQuery || slide.imagePrompt || visual?.query || slide.title;
          normalized.imageUrl = slide.imageUrl || undefined;
          normalized.caption = slide.caption || slide.takeaway || undefined;
          break;

        case 'quote':
          normalized.quote = slide.quote || (Array.isArray(slide.content) ? slide.content[0] : slide.text) || 'Focus on relentless execution and long-term vision.';
          normalized.author = slide.author || slide.attribution || 'Key Principle';
          break;

        case 'diagram':
          normalized.diagramType = slide.diagramType || visual?.diagramType || 'flow';
          normalized.nodes = Array.isArray(slide.nodes) && slide.nodes.length > 0
            ? slide.nodes.map((n, i) => ({
                id: n.id || String(i + 1),
                label: String(n.label || n.title || `Stage ${i + 1}`).trim(),
                description: String(n.description || '').trim()
              })).slice(0, 4)
            : [
                { id: '1', label: 'Input Ingestion', description: 'Stream processing & validation' },
                { id: '2', label: 'Core Engine', description: 'Semantic routing & synthesis' },
                { id: '3', label: 'Target Output', description: 'Verified delivery contract' }
              ];
          normalized.connections = Array.isArray(slide.connections) ? slide.connections : [];
          break;

        case 'chart':
          normalized.chartType = ['bar', 'line', 'pie', 'doughnut', 'area'].includes(slide.chartType?.toLowerCase())
            ? slide.chartType.toLowerCase()
            : 'bar';
          normalized.chartTitle = slide.chartTitle || slide.title || 'Metric Trends';
          normalized.analysis = slide.analysis || slide.takeaway || slide.purpose || undefined;

          // Normalize Chart Data (handles both visual.data [{label, value}] and standard series)
          let labels = [];
          let series = [];

          if (Array.isArray(slide.data) && slide.data.length > 0 && typeof slide.data[0] === 'object' && 'label' in slide.data[0]) {
            labels = slide.data.map(d => String(d.label));
            series = [{ name: slide.chartTitle || 'Metric', values: slide.data.map(d => Number(d.value) || 0) }];
          } else {
            labels = Array.isArray(slide.data?.labels) ? slide.data.labels : (Array.isArray(slide.labels) ? slide.labels : ['Baseline', 'Current', 'Projected']);
            const rawSeries = Array.isArray(slide.data?.series) ? slide.data.series : (Array.isArray(slide.series) ? slide.series : []);
            if (rawSeries.length === 0) {
              series = [{ name: 'Performance Index', values: [35, 65, 95] }];
            } else {
              series = rawSeries.map(s => ({
                name: s.name || 'Metrics',
                values: Array.isArray(s.values) ? s.values.map(v => Number(v) || 0) : [10, 20, 30]
              }));
            }
          }

          normalized.data = { labels, series };
          break;

        case 'table':
          normalized.headers = Array.isArray(slide.headers) ? slide.headers.map(String) : (Array.isArray(visual?.columns) ? visual.columns.map(String) : ['Specification', 'Standard', 'Target']);
          normalized.rows = Array.isArray(slide.rows)
            ? slide.rows.map(row => Array.isArray(row) ? row.map(String) : [String(row), '-', '-'])
            : [['Throughput', '500 rps', '2,400 rps'], ['Latency SLA', '< 200ms', '< 45ms']];
          normalized.caption = slide.caption || undefined;
          break;

        case 'comparison':
          normalized.columns = Array.isArray(slide.columns) && slide.columns.length > 0
            ? slide.columns.map(col => ({
                name: (col.name || 'Option').trim(),
                features: Array.isArray(col.features) ? col.features.map(String) : (Array.isArray(col.points) ? col.points.map(String) : ['Verified reliability', 'High scalability']),
                verdict: col.verdict ? String(col.verdict) : undefined
              })).slice(0, 3)
            : [
                { name: 'Traditional Workflow', features: ['High latency', 'Manual scaling', 'High operational overhead'], verdict: 'Legacy' },
                { name: 'Modern Architecture', features: ['Sub-100ms latency', 'Zero-config auto-scaling', '99.99% availability'], verdict: 'Recommended' }
              ];
          break;

        case 'kpi':
        case 'statistics':
          normalized.kpis = Array.isArray(slide.kpis) && slide.kpis.length > 0
            ? slide.kpis.map(k => ({
                value: String(k.value || '100%').trim(),
                label: String(k.label || 'Metric').trim(),
                change: k.change ? String(k.change).trim() : undefined,
                note: k.note ? String(k.note).trim() : undefined
              })).slice(0, 4)
            : [
                { value: '99.99%', label: 'Availability SLA', change: '+1.4% MoM' },
                { value: '38ms', label: 'Median Latency', change: '-40% reduction' },
                { value: '10x', label: 'Throughput Scaling', change: 'Zero loss' }
              ];
          break;

        case 'process':
        case 'flowchart':
          normalized.steps = Array.isArray(slide.steps) && slide.steps.length > 0
            ? slide.steps.map((st, i) => ({
                stepNumber: st.stepNumber || i + 1,
                name: String(st.name || st.title || `Phase ${i + 1}`).trim(),
                description: String(st.description || '').trim()
              })).slice(0, 4)
            : [
                { stepNumber: 1, name: 'Input Ingestion', description: 'Stream processing & validation' },
                { stepNumber: 2, name: 'Semantic Routing', description: 'Heuristic & fast-path model classifier' },
                { stepNumber: 3, name: 'Isolated Execution', description: 'Failover-resilient API synthesis engine' },
                { stepNumber: 4, name: 'Verified Dispatch', description: 'Strict contract verification & response' }
              ];
          break;

        case 'timeline':
          normalized.milestones = Array.isArray(slide.milestones) && slide.milestones.length > 0
            ? slide.milestones.map(m => ({
                date: String(m.date || m.phase || 'Phase 1').trim(),
                title: String(m.title || 'Milestone').trim(),
                description: String(m.description || '').trim()
              })).slice(0, 4)
            : [
                { date: 'Phase 1', title: 'Scaffolding', description: 'Core spec design and contract definitions' },
                { date: 'Phase 2', title: 'Integration', description: 'Multi-tier routing and failover mechanics' },
                { date: 'Phase 3', title: 'Production', description: 'Global high-concurrency rollout' }
              ];
          break;

        case 'architecture':
        case 'hierarchy':
          normalized.layers = Array.isArray(slide.layers) && slide.layers.length > 0
            ? slide.layers.map(l => ({
                name: String(l.name || 'Layer').trim(),
                components: Array.isArray(l.components) ? l.components.map(String) : ['Component A', 'Component B']
              })).slice(0, 3)
            : [
                { name: 'Transport Layer', components: ['WebSocket Adapter', 'Payload Validator'] },
                { name: 'Intelligence Layer', components: ['Classifier', 'Multi-Tier Fallback Pool'] },
                { name: 'Storage Layer', components: ['Atomic KV DB', 'Session Cache'] }
              ];
          break;

        case 'conclusion':
        case 'takeaways':
          normalized.summaryPoints = Array.isArray(slide.summaryPoints) && slide.summaryPoints.length > 0
            ? slide.summaryPoints.map(String).slice(0, 4)
            : (Array.isArray(slide.content) ? slide.content.map(String).slice(0, 4) : [
                'Multi-tier model routing ensures 100% operational uptime and quality.',
                'Sub-second latency architecture built for robust concurrent workflows.'
              ]);
          normalized.callToAction = slide.callToAction ? String(slide.callToAction).trim() : 'Proceed to implementation and rollout.';
          break;

        case 'references':
          normalized.sources = Array.isArray(slide.sources) && slide.sources.length > 0
            ? slide.sources.map(s => ({
                title: String(s.title || 'Reference Source').trim(),
                url: s.url ? String(s.url).trim() : undefined,
                description: s.description ? String(s.description).trim() : undefined
              })).slice(0, 4)
            : [
                { title: 'Technical Documentation', description: 'API reference & model contracts' }
              ];
          break;
      }

      return normalized;
    });

    return {
      title,
      subtitle,
      author,
      date,
      category,
      presentationType,
      themeColor: themeKey,
      palette: THEME_PALETTES[themeKey],
      slides: sanitizedSlides
    };
  }

  /**
   * Fallback lexical parser for freeform text/markdown to Presentation JSON.
   */
  static repairFromText(rawText, userPrompt = '') {
    const clean = (rawText || '').trim();
    const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let title = 'Strategic Overview & Analysis';
    let subtitle = userPrompt ? userPrompt.substring(0, 60) : 'Comprehensive Presentation';
    const slides = [];

    // Extract potential title from first H1 / Heading
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('# ')) {
        title = lines[i].replace(/^#+\s*/, '').trim();
        break;
      }
    }

    // Title Slide
    slides.push({
      type: 'title',
      title: title,
      subtitle: subtitle,
      author: 'Mark • Personal AI Assistant',
      date: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    });

    // Group into sections/slides
    let currentSlide = null;
    for (const line of lines) {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        if (currentSlide && currentSlide.bullets?.length > 0) {
          slides.push(currentSlide);
        }
        const headingText = line.replace(/^#+\s*/, '').trim();
        currentSlide = {
          type: 'text',
          title: headingText,
          bullets: []
        };
      } else if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line)) {
        const itemText = line.replace(/^[-*]|\d+\.\s*/, '').trim();
        if (!currentSlide) {
          currentSlide = {
            type: 'text',
            title: 'Core Insights',
            bullets: []
          };
        }
        currentSlide.bullets.push(itemText);
      } else if (line.length > 20 && !line.startsWith('#')) {
        if (!currentSlide) {
          currentSlide = {
            type: 'text',
            title: 'Executive Briefing',
            bullets: []
          };
        }
        currentSlide.bullets.push(line);
      }
    }

    if (currentSlide && currentSlide.bullets?.length > 0) {
      slides.push(currentSlide);
    }

    // Add Conclusion Slide
    slides.push({
      type: 'conclusion',
      title: 'Conclusion & Strategic Takeaways',
      summaryPoints: [
        'Strategic alignment across all milestones.',
        'High-velocity implementation with verified fault-tolerance.'
      ],
      callToAction: 'Deploy across active environments.'
    });

    return this.validate({
      title,
      subtitle,
      slides
    }, userPrompt);
  }
}
