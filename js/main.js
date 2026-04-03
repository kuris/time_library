// ══════════════════════════════
//  js/main.js
//  앱 진입점 — 모든 모듈을 조립
// ══════════════════════════════

import { AudioManager }    from './AudioManager.js';
import { GameEngine }      from './GameEngine.js';
import { LibraryUI }       from './LibraryUI.js';
import { NEWSPAPERS }      from './data/index.js';
import { storyIMF1997 }    from './stories/story_imf1997.js';
import { story1980 }       from './stories/story_1980.js';
import { AdminUI }         from './AdminUI.js';

// ── 하드코딩 스토리 맵 ─────────────────────────────────────────
// { scenarioKey: (engine, solveCase) => void }
// 새 스토리를 추가하려면 여기에 한 줄만 추가하면 됩니다.
const STORIES = {
  imf1997:  storyIMF1997,
  choi1980: story1980,
};

// ── 앱 초기화 ──────────────────────────────────────────────────
const audio   = new AudioManager();
const engine  = new GameEngine(audio);
const library = new LibraryUI(engine, audio, NEWSPAPERS, STORIES);
const admin   = new AdminUI(library);

// ── 라우팅 ──
const handleRoute = () => {
  const hash = window.location.hash;
  if (hash === '#/admin' || hash === '#admin') {
    library.showScreen('admin');
  } else if (hash === '#/library' || hash === '#library' || !hash) {
    library.showScreen('library');
  }
};

window.addEventListener('hashchange', handleRoute);
handleRoute(); // 초기 실행
