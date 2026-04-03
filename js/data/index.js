// ══════════════════════════════
//  js/data/index.js
//  전체 시나리오 데이터 통합 export
// ══════════════════════════════

import { scenarios_1980s } from './scenarios_1980s.js';
import { scenarios_1990s } from './scenarios_1990s.js';
import { scenarios_2000s } from './scenarios_2000s.js';

export const NEWSPAPERS = {
  ...scenarios_1980s,
  ...scenarios_1990s,
  ...scenarios_2000s,
};
