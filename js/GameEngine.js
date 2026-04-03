// ══════════════════════════════
//  GameEngine.js
//  게임 상태, 타이핑 엔진, 단서/스탯 관리
// ══════════════════════════════

export class GameEngine {
  constructor(audio) {
    this.audio = audio;
    this.TYPE_SPEED = 20;

    // ── 게임 상태 ──
    this.state = {
      cluesFound: [],
      usedChoices: [],   // 현재 사건에서 이미 선택한 인덱스들
      totalClues: 5,
      currentKey: null,
      solved: {},        // { 'imf1997': true, ... }
      stats: { money: 100, stamina: 100, mental: 100, stress: 0 },
    };

    // ── 타이핑 큐 ──
    this._queue = [];
    this._busy  = false;

    // ── 의존성 주입 (LibraryUI가 세팅) ──
    this._onStaminaDepleted = null;
  }

  // ─────────────────────────────
  //  상태 초기화
  // ─────────────────────────────
  resetForCase(key) {
    this.state.currentKey  = key;
    this.state.cluesFound  = [];
    this.state.usedChoices = [];
    this.state.totalClues  = 5;
    this.state.stats       = { money: 100, stamina: 100, mental: 100, stress: 0 };
    this._queue = [];
    this._busy  = false;
  }

  // ─────────────────────────────
  //  타이핑 엔진
  // ─────────────────────────────
  log(type, msg, cb) {
    this._queue.push({ type, msg, cb });
    if (!this._busy) this._processQueue();
  }

  logD() {
    this._queue.push({ type: 'divider', msg: '' });
    if (!this._busy) this._processQueue();
  }

  _processQueue() {
    if (this._queue.length === 0) { this._busy = false; return; }
    this._busy = true;
    const item = this._queue.shift();

    const container = document.getElementById('game-log');

    if (item.type === 'divider') {
      const d = document.createElement('div');
      d.className = 'log-line divider';
      container.appendChild(d);
      this._scrollLog();
      if (item.cb) item.cb();
      setTimeout(() => this._processQueue(), 100);
      return;
    }

    const d = document.createElement('div');
    d.className = 'log-line ' + item.type;
    container.appendChild(d);

    let i = 0;
    const speed = item.type === 'time' ? 30 : item.type === 'inner' ? 25 : this.TYPE_SPEED;

    const tick = () => {
      if (i < item.msg.length) {
        d.textContent += item.msg[i++];
        this._scrollLog();
        if (Math.random() > 0.5) this.audio.play('type');
        setTimeout(tick, speed);
      } else {
        if (item.cb) item.cb();
        const pause = item.type === 'story' ? 120 : item.type === 'npc' ? 160 : 60;
        setTimeout(() => this._processQueue(), pause);
      }
    };
    tick();
  }

  _scrollLog() {
    const container = document.querySelector('.newspaper-main-container');
    if (container) {
      // 렌더링 직후에 스크롤 위치를 갱신하도록 보장
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      });
    }
  }

  isTyping() {
    return this._busy || this._queue.length > 0;
  }

  clearQueue() {
    this._queue = [];
    this._busy  = false;
  }

  // ─────────────────────────────
  //  선택지 렌더링
  // ─────────────────────────────
  showChoices(choices) {
    const waitAndShow = () => {
      if (this.isTyping()) { setTimeout(waitAndShow, 80); return; }

      const area = document.getElementById('game-choices');
      area.innerHTML = '';

      choices.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'btn-choice' + (c.isClue ? ' clue-btn' : c.isKey ? ' key-btn' : '');
        btn.textContent = c.label;
        btn.onclick = () => {
          area.innerHTML = '';
          this.clearQueue();
          const prev = document.createElement('div');
          prev.className = 'log-line system';
          prev.textContent = '▶ ' + c.label;
          document.getElementById('game-log').appendChild(prev);
          this.logD();
          this.audio.play('click');
          c.action();
        };
        area.appendChild(btn);
      });

      // 선택지가 나타날 때 자동으로 스크롤
      if (choices.length > 0) {
        requestAnimationFrame(() => {
          area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    };
    waitAndShow();
  }

  // ─────────────────────────────
  //  단서 (Clues)
  // ─────────────────────────────
  addClue(id, label, desc) {
    if (this.state.cluesFound.includes(id)) return false;
    this.state.cluesFound.push(id);
    this.audio.play('clue');
    this.addClueToPanel(label, desc);
    this.updateMysteryProgress(); // 단서 카운트 및 미스터리 바 통합 업데이트
    return true;
  }

  addClueToPanel(label, desc, animate = true) {
    const list = document.getElementById('clue-list');
    if (!list) return;

    const div = document.createElement('div');
    div.className = 'clue-item';
    div.innerHTML = `<div class="clue-item-title">${label}</div><div class="clue-item-desc">${desc}</div>`;
    list.appendChild(div);

    if (animate) {
      setTimeout(() => div.classList.add('visible'), 50);
    } else {
      div.classList.add('visible');
    }
    this.updateMysteryProgress();
  }

  updateMysteryProgress() {
    const total = this.state.totalClues || 5;
    const found = this.state.cluesFound.length;
    const pct   = Math.min(100, Math.round((found / total) * 100));

    const fill   = document.getElementById('mystery-fill');
    const pctEl  = document.getElementById('mystery-pct');
    const clueEl = document.getElementById('game-clues');

    if (fill)   fill.style.width    = pct + '%';
    if (pctEl)  pctEl.textContent   = pct + '%';
    if (clueEl) clueEl.textContent  = `단서 ${found}/${total}`;
  }

  resetMysteryBar() {
    this.updateMysteryProgress();
  }

  // ─────────────────────────────
  //  스탯 관리
  // ─────────────────────────────
  modifyStat(key, val) {
    this.state.stats[key] += val;
    if (['stamina', 'mental'].includes(key)) {
      this.state.stats[key] = Math.min(100, Math.max(0, this.state.stats[key]));
    }
    if (key === 'stress') {
      this.state.stats[key] = Math.max(0, Math.min(100, this.state.stats[key]));
    }
    this.renderStats();

    if (this.state.stats.stamina <= 0 && this._onStaminaDepleted) {
      this.log('bad', '⚠️ 체력이 바닥나 더 이상 조사를 계속할 수 없습니다...');
      setTimeout(() => this._onStaminaDepleted(), 2000);
    }
  }

  applyEffects(effectStr) {
    if (!effectStr) return;
    effectStr.split('|').forEach(p => {
      const [k, v] = p.split(':');
      this.modifyStat(k.trim(), parseInt(v));
    });
  }

  renderStats() {
    const s = this.state.stats;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('stat-money',   s.money.toLocaleString());
    set('stat-stamina', s.stamina);
    set('stat-mental',  s.mental);
    set('stat-stress',  s.stress);

    const st = document.getElementById('stat-stamina');
    const ss = document.getElementById('stat-stress');
    if (st) st.className = 'stat-value' + (s.stamina < 30 ? ' minus' : '');
    if (ss) ss.className = 'stat-value' + (s.stress > 70  ? ' minus' : '');
  }

  // ─────────────────────────────
  //  유틸
  // ─────────────────────────────
  clearEl(id) {
    const e = document.getElementById(id);
    if (e) e.innerHTML = '';
  }

  setLocation(loc) {
    const el = document.getElementById('game-location');
    if (el) el.textContent = loc;
  }

  setEraBadge(text) {
    const el = document.getElementById('game-era-badge');
    if (el) el.textContent = text;
  }

  // ─────────────────────────────
  //  세이브/로드 (LocalStorage)
  // ─────────────────────────────
  saveState() {
    const data = {
      solved: this.state.solved,
      // 추후 글로벌 스탯이나 해금 요소가 생기면 여기에 추가
    };
    localStorage.setItem('time_library_save', JSON.stringify(data));
    console.log('✅ Game progress saved.');
  }

  loadState() {
    const saved = localStorage.getItem('time_library_save');
    if (!saved) return false;
    try {
      const data = JSON.parse(saved);
      if (data.solved) {
        this.state.solved = data.solved;
      }
      console.log('📖 Game progress loaded.');
      return true;
    } catch (e) {
      console.error('❌ Failed to load save data:', e);
      return false;
    }
  }

  hasSaveData() {
    return !!localStorage.getItem('time_library_save');
  }
}
