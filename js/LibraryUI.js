// ══════════════════════════════
//  LibraryUI.js
//  화면 전환, 신문 렌더링, 조사 엔진
// ══════════════════════════════

export class LibraryUI {
  constructor(engine, audio, newspapers, stories) {
    this.engine     = engine;
    this.audio      = audio;
    this.newspapers = newspapers;  // 전체 시나리오 데이터
    this.stories    = stories;     // 하드코딩 스토리 맵 { key: fn }

    this._npCluesFound = [];

    // 체력 0 → 도서관 귀환
    this.engine._onStaminaDepleted = () => this.backToLibrary();

    // 전역 노출 (HTML onclick 속성에서 호출)
    window.openNewspaper  = (k) => this.openNewspaper(k);
    window.enterEra       = (k) => this.enterEra(k);
    window.backToLibrary  = ()  => this.backToLibrary();
    window.findClueInNp   = (id, label, desc) => this.findClueInNp(id, label, desc);

    this.initTheme();
  }

  // ─────────────────────────────
  //  테마 관리 (Dark / Parchment)
  // ─────────────────────────────
  initTheme() {
    const saved = localStorage.getItem('time_library_theme') || 'parchment';
    this.setTheme(saved);

    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.onclick = () => {
        const current = document.body.classList.contains('theme-dark') ? 'dark' : 'parchment';
        this.setTheme(current === 'dark' ? 'parchment' : 'dark');
      };
    }
  }

  setTheme(name) {
    const icon = document.getElementById('theme-icon');
    if (name === 'dark') {
      document.body.classList.add('theme-dark');
      if (icon) icon.textContent = '☀️';
    } else {
      document.body.classList.remove('theme-dark');
      if (icon) icon.textContent = '🌙';
    }
    localStorage.setItem('time_library_theme', name);
  }

  // ─────────────────────────────
  //  화면 전환
  // ─────────────────────────────
  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
  }

  flashTransition(cb) {
    const f = document.getElementById('flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
    setTimeout(() => { f.classList.remove('go'); if (cb) cb(); }, 800);
  }

  landingTransition(year, date, msg, cb) {
    const ov = document.getElementById('landing-overlay');
    document.getElementById('landing-year').textContent = year;
    document.getElementById('landing-date').textContent = date;
    document.getElementById('landing-msg').textContent  = msg;

    ['landing-year', 'landing-date', 'landing-msg'].forEach(id => {
      const el = document.getElementById(id);
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });

    ov.classList.add('active');
    this.audio.play('siren'); // 착륙 순간 빈티지 경보음
    setTimeout(() => { ov.classList.remove('active'); if (cb) cb(); }, 2400);
  }

  backToLibrary() {
    this.audio.play('click');
    this.flashTransition(() => this.showScreen('library'));
  }

  // ─────────────────────────────
  //  신문 읽기
  // ─────────────────────────────
  openNewspaper(key) {
    const np = this.newspapers[key];
    if (!np) return;
    this.engine.state.currentKey = key;
    this._npCluesFound = [];

    let col1 = np.col1 || '';
    let col2 = np.col2 || '';

    // 클릭 가능한 단서 마커 치환
    (np.clues || []).forEach(c => {
      if (!c.marker) return;
      const tag = `<span class="clue" data-clue="${c.id}" onclick="findClueInNp('${c.id}','${c.label}','${c.desc}')">${c.marker.replace(/\[|\]/g, '')}</span>`;
      col1 = col1.replace(c.marker, tag);
      col2 = col2.replace(c.marker, tag);
    });

    let html = `
      <div class="np-masthead">
        <div class="np-masthead-name">${np.masthead}</div>
        <div class="np-masthead-info"><span>${np.date}</span><span>${np.issue}</span></div>
      </div>
      <div class="np-main-headline">${np.headline}</div>
      <div class="np-sub-headline">${np.sub}</div>
      <div class="np-columns">
        <div><div class="np-col-title">${np.col1_title || ''}</div><div class="np-col-body">${col1}</div></div>
        <div><div class="np-col-title">${np.col2_title || ''}</div><div class="np-col-body">${col2}</div></div>
      </div>
    `;
    if (np.memo) html += `<div class="np-memo">${np.memo}</div>`;
    if (np.torn) html += `<div class="np-torn">${np.torn}</div>`;

    const solved = this.engine.state.solved[key];
    html += `<div class="np-action-row">
      <button class="np-btn" onclick="backToLibrary()">← 선반으로</button>`;
    if (np.enterLabel && !solved) {
      html += `<button class="np-btn primary" onclick="enterEra('${key}')">${np.enterLabel} →</button>`;
    } else if (solved) {
      html += `<button class="np-btn" style="color:#90b890;border-color:#90b89044;" disabled>✓ 이미 해결된 사건</button>`;
    } else {
      // enterLabel 없는 generic 케이스도 진입 가능하게
      html += `<button class="np-btn primary" onclick="enterEra('${key}')">이 신문 속으로 들어간다 →</button>`;
    }
    html += `</div>`;

    document.getElementById('newspaper-content').innerHTML = html;
    this.audio.play('paper');
    this.flashTransition(() => this.showScreen('newspaper'));
  }

  findClueInNp(id, label, desc) {
    const el = document.querySelector(`[data-clue="${id}"]`);
    if (el) el.classList.add('found');
    if (!this._npCluesFound.includes(id)) {
      this._npCluesFound.push(id);
      this.audio.play('clue');
    }
  }

  // ─────────────────────────────
  //  시대 진입
  // ─────────────────────────────
  enterEra(key) {
    const np = this.newspapers[key];
    if (!np) return;

    // 신문에서 찾은 단서를 초기 목록으로 설정
    this.engine.resetForCase(key);
    if (np.isGeneric === false) {
      this.engine.state.totalClues = 6;
    } else {
      this.engine.state.totalClues = (np.clues || []).length + (np.choices || []).filter(ch => ch.clue).length;
    }
    this.engine.state.cluesFound = [...this._npCluesFound];
    this._npCluesFound = [];

    this.landingTransition(np.landing.year, np.landing.date, np.landing.msg, () => {
      this.showScreen('game');
      this.engine.clearEl('game-log');
      this.engine.clearEl('game-choices');
      this.engine.clearEl('clue-list');
      this.engine.resetMysteryBar();
      this.engine.renderStats();

      // 신문에서 찾은 단서를 패널에 표시
      (np.clues || []).forEach(c => {
        if (this.engine.state.cluesFound.includes(c.id)) {
          this.engine.addClueToPanel(c.label, c.desc, false);
        }
      });

      // 스토리 시작
      if (np.isGeneric === false && this.stories[key]) {
        this.stories[key](this.engine, (k, headline, labels, ending) =>
          this.solveCase(k, headline, labels, ending)
        );
      } else {
        this._startGenericCase(key);
      }
    });
  }

  // ─────────────────────────────
  //  범용 조사 엔진
  // ─────────────────────────────
  _startGenericCase(key) {
    const np = this.newspapers[key];
    this.engine.setEraBadge(np.landing.date);
    this.engine.setLocation('📍 ' + (np.location || '서울'));

    // 배경 설명 및 통찰은 최초 1회만 출력 (중복 제거)
    this.engine.log('time', `[ ${np.landing.date} ${np.time || '오전'} ]`);
    this.engine.log('story', np.eventStory);
    if (np.mysteryInsight) this.engine.log('mystery', np.mysteryInsight);
    this.engine.logD();

    this._showInvestigationChoices(key);
  }

  _showInvestigationChoices(key) {
    const np = this.newspapers[key];
    const choices = (np.choices || [])
      .map((c, idx) => ({ ...c, originalIdx: idx }))
      .filter(c => !this.engine.state.usedChoices.includes(c.originalIdx))
      .map(c => ({
        label:  '▶ ' + c.text,
        action: () => this._processChoice(key, c.originalIdx),
      }));

    if (choices.length > 0) {
      this.engine.showChoices(choices);
    }
  }

  _processChoice(key, choiceIdx) {
    const np = this.newspapers[key];
    const c  = np.choices[choiceIdx];

    // 사용된 선택지로 기록
    if (!this.engine.state.usedChoices.includes(choiceIdx)) {
      this.engine.state.usedChoices.push(choiceIdx);
    }

    this.engine.log('story', c.result);
    this.engine.applyEffects(c.effect);

    if (c.clue) {
      const found = this.engine.addClue(c.clue.id, c.clue.label, c.clue.desc);
      if (found) this.engine.log('clue', '🔑 단서 발견 — ' + c.clue.label);
    }

    this.engine.logD();

    const totalNeeded = (np.clues || []).length + (np.choices || []).filter(ch => ch.clue).length;
    if (this.engine.state.cluesFound.length >= totalNeeded) {
      this.engine.log('good', '모든 단서를 확보했습니다. 진실의 윤곽이 드러납니다.');
      this.engine.showChoices([{
        label:  '▶ 도서관으로 돌아가 기록한다',
        isKey:  true,
        action: () => {
          const labels = this.engine.state.cluesFound.map(id => {
            const from1 = (np.clues || []).find(cc => cc.id === id);
            const from2 = (np.choices || []).find(ch => ch.clue && ch.clue.id === id)?.clue;
            return (from1 || from2)?.label || '미상의 단서';
          });
          this.solveCase(key, np.solveHeadline, labels, np.solveEnding);
        },
      }]);
    } else {
      this.engine.log('system', '아직 밝혀지지 않은 진실이 더 남아있는 것 같습니다...');
      this._showInvestigationChoices(key); // 배경 설명 없이 선택지만 다시 출력
    }
  }

  // ─────────────────────────────
  //  사건 해결
  // ─────────────────────────────
  solveCase(key, headline, clueLabels, ending) {
    this.engine.state.solved[key] = true;
    this.audio.play('solve');

    const item   = document.getElementById('np-item-' + key);
    const status = document.getElementById('np-status-' + key);
    if (item)   item.classList.add('solved');
    if (status) status.textContent = '✓ 해결됨';

    const np  = this.newspapers[key];
    let html  = `
      <div class="np-masthead">
        <div class="np-masthead-name">${np.masthead}</div>
        <div class="np-masthead-info"><span>${np.date}</span><span>${np.issue}</span></div>
      </div>
      <div class="solved-stamp-wrap"><span class="solved-stamp">SOLVED</span></div>
      <div class="solved-headline">${headline}</div>
      <div class="solved-clues"><div class="solved-clue-title">수집한 단서</div>
        ${clueLabels.map(l => `<div class="solved-clue-item">🔑 ${l}</div>`).join('')}
      </div>
      <div class="solved-ending">${ending}</div>
    `;

    document.getElementById('solved-content').innerHTML = html;
    this.flashTransition(() => this.showScreen('solved'));
  }
}
