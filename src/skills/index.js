import { skillLoader } from './loader.js';
import { skillResolver } from './resolver.js';
import { pdfSkill } from './pdf/index.js';
import { pptxSkill } from './pptx/index.js';

export {
  skillLoader,
  skillResolver,
  pdfSkill,
  pptxSkill
};

export default {
  loader: skillLoader,
  resolver: skillResolver,
  pdf: pdfSkill,
  pptx: pptxSkill
};
