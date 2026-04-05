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
    window.toggleCluePanel = () => this.toggleCluePanel();
    window.showClueContext = (id) => this.showClueContext(id);
    window.jumpToContext   = (id) => this.jumpToContext(id);

    // 지도 그리드 초기화
    this._initMapGrid();
    
    // Leaflet 지도 초기화 (위성 줌 연출용)
    this._initLeaflet();
  }

  // ── Leaflet 지도 초기화 ──
  _initLeaflet() {
    const mapEl = document.getElementById('map-zoom-container');
    if (!mapEl) return;
    
    // 초기 줌은 한국 근해를 비춤
    this.map = L.map('map-zoom-container', {
      center: [36.5, 127.5],
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      boxZoom: false
    });

    // Esri World Imagery 위성 데이터 추가
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    }).addTo(this.map);
  }

  // ── 지도 도트 그리드 생성 ──
  _initMapGrid() {
    const g = document.getElementById('map-dots');
    if (!g) return;
    let html = '';
    for(let x=0; x<200; x+=10) {
      for(let y=0; y<300; y+=10) {
        html += `<circle cx="${x}" cy="${y}" r="0.5" />`;
      }
    }
    g.innerHTML = html;
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

  landingTransition(year, date, msg, location, cb) {
    const ov = document.getElementById('landing-overlay');
    document.getElementById('landing-year').textContent = year;
    document.getElementById('landing-date').textContent = date;
    document.getElementById('landing-msg').textContent  = msg;

    // 타임머신 지도 좌표 매핑
    this._updateMapTarget(location);

    const elements = ['landing-year', 'landing-date', 'landing-msg', 'landing-map-container', 'landing-location', 'map-target'];
    elements.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      el.classList.remove('active');
    });

    ov.classList.add('active');
    document.getElementById('map-target').classList.add('active');
    document.getElementById('landing-location').classList.add('active');

    // ────────────────────────────
    // 💡 중요: 오버레이가 활성화된(display: flex) 직후 지도의 크기를 재계산해야 합니다.
    // ────────────────────────────
    if (this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 50);
    }

    this.audio.play('siren'); // 착륙 순간 빈티지 경보음
    // 애니메이션 시퀀스 완료 후 종료 (약 5.2초로 연장)
    setTimeout(() => { ov.classList.remove('active'); if (cb) cb(); }, 5500);
  }

  _updateMapTarget(locationStr) {
    const coordsMap = {
      '서울': { lat: 37.5665, lng: 126.9780, x: 405, y: 265 },
      '서초': { lat: 37.4833, lng: 127.0322, x: 408, y: 268 },
      '여의도': { lat: 37.5216, lng: 126.9242, x: 402, y: 267 },
      '명동': { lat: 37.5635, lng: 126.9850, x: 406, y: 266 },
      '강남': { lat: 37.4979, lng: 127.0276, x: 409, y: 269 },
      '잠실': { lat: 37.5133, lng: 127.1001, x: 412, y: 270 },
      '부천': { lat: 37.5034, lng: 126.7660, x: 395, y: 272 },
      '김포': { lat: 37.5843, lng: 126.7115, x: 390, y: 260 },
      '성동': { lat: 37.5635, lng: 127.0365, x: 410, y: 265 },
      '대구': { lat: 35.8714, lng: 128.6014, x: 435, y: 325 },
      '구미': { lat: 36.1294, lng: 128.3436, x: 420, y: 315 },
      '부산': { lat: 35.1796, lng: 129.0756, x: 455, y: 345 },
      '김해': { lat: 35.2285, lng: 128.8894, x: 445, y: 340 },
      '진도': { lat: 34.4868, lng: 126.2634, x: 380, y: 360 },
      '광주': { lat: 35.1595, lng: 126.8526, x: 395, y: 340 },
    };

    let target = { lat: 37.5, lng: 127, x: 400, y: 300 }; // 기본값
    let cityName = 'UNKNOWN';

    // 문자열에서 도시 키워드 추출
    for (const [key, t] of Object.entries(coordsMap)) {
      if (locationStr && locationStr.includes(key)) {
        target = t;
        cityName = key;
        break;
      }
    }

    // Leaflet 줌 애니메이션 설정
    if (this.map) {
      // 시작점 리셋 (한국 근해)
      this.map.setView([36.5, 127.5], 6, { animate: false });
      
      // 0.5초 대기 후 다이빙 시작
      setTimeout(() => {
        this.map.flyTo([target.lat, target.lng], 17, {
          duration: 3.5,
          easeLinearity: 0.25
        });
      }, 500);
    }

    const outer = document.getElementById('map-ping-outer');
    const inner = document.getElementById('map-ping-inner');
    const locText = document.getElementById('landing-location');
    const svgMap = document.querySelector('.landing-map-svg');

    if (outer) { outer.setAttribute('cx', target.x); outer.setAttribute('cy', target.y); }
    if (inner) { inner.setAttribute('cx', target.x); inner.setAttribute('cy', target.y); }
    
    // 줌을 위한 transform-origin 설정 (viewBox 800x600 기반)
    if (svgMap) {
      const originX = (target.x / 800) * 100;
      const originY = (target.y / 600) * 100;
      svgMap.style.transformOrigin = `${originX}% ${originY}%`;
    }

    if (locText) {
      // 위성 데이터 느낌의 좌표 텍스트 생성
      const lat = (33 + Math.random() * 5).toFixed(4);
      const lng = (124 + Math.random() * 7).toFixed(4);
      locText.innerHTML = `
        <div style="font-size:10px; opacity:0.6; margin-bottom:4px;">SCANNING ARCHIVE...</div>
        <div>LAT: ${lat}N</div>
        <div>LNG: ${lng}E</div>
        <div style="color:var(--accent); margin-top:8px;">LOC: ${cityName}</div>
        <div style="font-size:18px; margin-top:4px;">LOCK-ON [OK]</div>
      `;
    }
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
    this.engine.state.currentKey = key;
    this._npCluesFound = [];

    // UI 초기화 (수사 구역 숨김 및 헤더 설정)
    document.getElementById('field-notes-area').classList.remove('active');
    document.getElementById('game-stats').classList.remove('active');
    
    const totalNeeded = (np.clues || []).length + (np.choices || []).filter(ch => ch.clue).length;
    document.getElementById('game-era-badge').textContent = '──';
    document.getElementById('game-location').textContent  = '도서관 내부 — 기록 보관소';
    document.getElementById('game-clues').textContent     = `단서 ${this._npCluesFound.length}/${totalNeeded}`;

    const overlay = document.getElementById('clue-panel-overlay');
    const closeBtn = document.querySelector('.clue-panel-close');
    
    // 사이드바 활성화 및 미스터리 바 표시 (모바일에선 닫힌 채로 시작)
    if (window.innerWidth > 768) {
      document.querySelector('.clue-panel').classList.add('active');
      if (overlay) overlay.classList.remove('active');
      if (closeBtn) closeBtn.style.display = 'none';
    } else {
      document.querySelector('.clue-panel').classList.remove('active');
      if (overlay) overlay.classList.remove('active');
      if (closeBtn) closeBtn.style.display = 'block';
    }
    document.getElementById('clue-list').innerHTML = '';
    this.engine.resetMysteryBar(totalNeeded);
    this.engine.renderStats();

    // 복구 시 이미 찾은 신문 단서가 있다면 표시
    this._npCluesFound.forEach(id => {
      const c = (np.clues || []).find(x => x.id === id);
      if (c) this.engine.addClueToPanel(c.label, c.desc, false);
    });
    
    this.engine.updateMysteryProgress();

    let col1 = np.col1 || '';
    let col2 = np.col2 || '';

    // 클릭 가능한 단서 마커 치환
    (np.clues || []).forEach(c => {
      if (!c.marker) return;
      const tag  = `<span class="clue" data-clue="${c.id}" onclick="findClueInNp('${c.id}','${c.label}','${c.desc}')">${c.marker.replace(/\[|\]/g, '')}</span>`;
      // 모든 발생 지점에 대해 전역 치환 (RegExp 활용)
      const safeMarker = c.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
      col1 = col1.replace(new RegExp(safeMarker, 'g'), tag);
      col2 = col2.replace(new RegExp(safeMarker, 'g'), tag);
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
      html += `<button class="np-btn" onclick="enterEra('${key}')" style="color:#90b890; border-color:rgba(144,184,144,0.4);">🔍 다시 수사하기 (재수사)</button>`;
    } else {
      // enterLabel 없는 generic 케이스도 진입 가능하게
      html += `<button class="np-btn primary" onclick="enterEra('${key}')">이 신문 속으로 들어간다 →</button>`;
    }
    html += `</div>
    <div style="font-size:9px; color:#a67c00; margin-top:20px; text-align:center; opacity:0.8;">
      💡 신문 기사 본문의 <span style="border-bottom:1px solid #c8a96e; background:rgba(200,169,110,0.1);">키워드</span>를 클릭하여 단서를 미리 수집할 수 있습니다.
    </div>`;

    document.getElementById('newspaper-content').innerHTML = html;
    this.audio.play('paper');
    this.flashTransition(() => this.showScreen('newspaper'));
  }

  findClueInNp(id, label, desc) {
    const el = document.querySelector(`[data-clue="${id}"]`);
    if (el) el.classList.add('found');

    // 1. 임시 수집 (신문 읽기 단계)
    if (!this._npCluesFound.includes(id)) {
      this._npCluesFound.push(id);
    }

    // 2. 수령 즉시 반영 (이미 수사 중이거나 신문 읽는 중)
    if (this.engine.state.currentKey) {
      const added = this.engine.addClue(id, label, desc);
      if (added) this.audio.play('clue');
    } else {
      // 신문만 보던 중일 때도 패널에 이름과 설명 표시
      const alreadyInList = Array.from(document.querySelectorAll('.clue-item-title'))
                            .some(el => el.textContent === label);
      if (!alreadyInList) {
        this.engine.addClueToPanel(label, desc, true);
        this.audio.play('clue');
      }
      // 상부 카운트 및 미스터리 바 업데이트
      const np = this.newspapers[this._currentNewspaperKey];
      const totalNeeded = (np.clues || []).length + (np.choices || []).filter(ch => ch.clue).length;
      document.getElementById('game-clues').textContent = `단서 ${this._npCluesFound.length}/${totalNeeded}`;
      
      const pct = Math.round((this._npCluesFound.length / totalNeeded) * 100);
      document.getElementById('mystery-fill').style.width = pct + '%';
      document.getElementById('mystery-pct').textContent  = pct + '%';
    }
  }

  // ─────────────────────────────
  //  시대 진입
  // ─────────────────────────────
  enterEra(key) {
    const np = this.newspapers[key];
    if (!np) return;

    const isSameCase = (this.engine.state.currentKey === key);
    const isSolved   = this.engine.state.solved[key];
    let isResuming   = false;

    if (isSameCase && !isSolved) {
      // 1. 동일 사건 재진입 (미해결 시): 기존 세션 유지
      isResuming = true;
      // 신문에서 새로 클릭해서 찾은 단서들을 병합
      this._npCluesFound.forEach(id => {
        if (!this.engine.state.cluesFound.includes(id)) {
          const c = (np.clues || []).find(x => x.id === id);
          if (c) this.engine.addClue(c.id, c.label, c.desc);
        }
      });
    } else {
      // 2. 새 사건 진입 또는 해결된 건 재수사: 초기화
      this.engine.resetForCase(key);
      this.engine.state.cluesFound = [...this._npCluesFound];
    }

    // 단서 합산 (신문 단서 + 조사/스토리 단서)
    const npClueCount    = (np.clues || []).length;
    const choiceClueCount = (np.choices || []).filter(ch => ch.clue).length;
    const storyClueCount  = np.storyClueCount || (np.isGeneric === false ? 6 : 0);

    this.engine.state.totalClues = npClueCount + choiceClueCount + storyClueCount;
    this._npCluesFound = [];

    // 자동저장 시점 (수사 개시)
    this.engine.saveState();

    this.landingTransition(np.landing.year, np.landing.date, np.landing.msg, np.location, () => {
      document.getElementById('field-notes-area').classList.add('active');
      document.getElementById('game-stats').classList.add('active');
      
      // 모바일에서는 시대 진입 시 자동으로 단서창을 열지 않음
      if (window.innerWidth > 768) {
        document.querySelector('.clue-panel').classList.add('active');
      }

      if (isResuming) {
        this.engine.log('system', '⏳ 이전에 중단된 지점에서 수사를 재개합니다...');
      } else {
        this.engine.clearEl('game-log');
        this.engine.clearEl('clue-list');
        this.engine.resetMysteryBar();
      }
      
      this.engine.clearEl('game-choices');
      this.engine.renderStats();

      // 세션 유지 시에도 단서 패널에 표시되지 않은 단서들(병합된 것 등)을 다시 그려줌
      if (isResuming) {
        this.engine.clearEl('clue-list');
        (np.clues || []).forEach(c => {
          if (this.engine.state.cluesFound.includes(c.id)) {
            this.engine.addClueToPanel(c.label, c.desc, false);
          }
        });
        // 스토리/선택지 단서들도 포함
        this.engine.state.cluesFound.forEach(id => {
          const skip = (np.clues || []).some(cc => cc.id === id);
          if (!skip) {
             const from2 = (np.choices || []).find(ch => ch.clue && ch.clue.id === id)?.clue;
             if (from2) this.engine.addClueToPanel(from2.label, from2.desc, false);
          }
        });
        this.engine.updateMysteryProgress();
      }

      this.engine.clearScenes(); // 새 시작 시 씬 레지스트리 초기화

      if (np.isGeneric === false && this.stories[key]) {
        // 하드코딩 스토리
        this.stories[key](this.engine, (k, headline, labels, ending) =>
          this.solveCase(k, headline, labels, ending)
        );

        // 만약 중단된 씬이 있다면 해당 지점으로 점프
        if (isResuming && this.engine.state.currentScene) {
          const sceneFn = this.engine.getScene(this.engine.state.currentScene);
          if (sceneFn) {
            this.engine.clearQueue(); // story function이 내부적으로 호출한 start() 로그 등 삭제
            this.engine.log('system', '⏳ 시간의 파편을 연결하여 이전 지점으로 도약합니다...');
            sceneFn();
          }
        }
      } else {
        // 범용 케이스 (isResuming 전달)
        this._startGenericCase(key, isResuming);
      }
    });
  }

  // ─────────────────────────────
  //  범용 조사 엔진
  // ─────────────────────────────
  _startGenericCase(key, isResuming = false) {
    const np = this.newspapers[key];
    this.engine.setEraBadge(np.landing.date);
    this.engine.setLocation('📍 ' + (np.location || '서울'));

    if (!isResuming) {
      this.engine.log('time', `[ ${np.landing.date} ${np.time || '오전'} ]`);
      this.engine.log('story', np.eventStory);
      if (np.mysteryInsight) this.engine.log('mystery', np.mysteryInsight);
      this.engine.log('system', 'TIP: 신문 기사 본문의 강조된 키워드들도 수집해야 하는 단서입니다.');
      this.engine.logD();
    }

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
    } else {
      this.engine.showChoices([{
        label:  '▶ 도서관으로 돌아가 신문을 다시 확인한다',
        action: () => this.backToLibrary(),
      }]);
    }
  }

  _processChoice(key, choiceIdx) {
    const np = this.newspapers[key];
    const c  = np.choices[choiceIdx];

    if (!this.engine.state.usedChoices.includes(choiceIdx)) {
      this.engine.state.usedChoices.push(choiceIdx);
    }

    this.engine.log('story', c.result);
    this.engine.applyEffects(c.effect);

    if (c.clue) {
      const found = this.engine.addClue(c.clue.id, c.clue.label, c.clue.desc, 'generic', choiceIdx);
      if (found) {
        this.engine.log('clue', '🔑 단서 발견 — ' + c.clue.label);
        this.engine.saveState(); // 자동저장 시점 (단서 획득)
      }
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
    this.engine.state.solved[key] = {
      solved: true,
      count:  this.engine.state.cluesFound.length,
      total:  this.engine.state.totalClues
    };
    this.engine.state.currentKey  = null; // 해결 시 진행 중 세션 초기화
    this.engine.saveState(); // 자동 저장
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
      <div class="solved-clues"><div class="solved-clue-title">수집한 단서 (클릭하여 맥락 확인)</div>
        ${this.engine.state.cluesFound.map(id => {
          const ctx = this.engine.state.clueContexts[id];
          const label = ctx ? ctx.label : '알 수 없는 단서';
          return `<div class="solved-clue-item clickable" onclick="showClueContext('${id}')">🔑 ${label}</div>`;
        }).join('')}
      </div>
      <div class="solved-ending">${ending}</div>
    `;

    document.getElementById('solved-content').innerHTML = html;
    this.flashTransition(() => this.showScreen('solved'));
  }

  // ─────────────────────────────
  //  로드된 데이터 UI 반영
  // ─────────────────────────────
  // ─────── 세션 복구 ───────
  restoreSession() {
    const key = this.engine.state.currentKey;
    if (!key) return;

    // 1. 해당 신문 열기
    this.openNewspaper(key);

    // 2. 수사 영역 활성화
    const area = document.querySelector('.field-notes-area');
    if (area) area.classList.add('active');

    // 3. 로그 복구
    const log = document.getElementById('game-log');
    if (log && this.engine.state._tempLogHTML) {
      log.innerHTML = this.engine.state._tempLogHTML;
      delete this.engine.state._tempLogHTML;
      this.engine._scrollLog();
    }

    // 4. 단서 패널 및 미스터리 바 동기화
    this.engine.updateMysteryProgress();
    this.engine.renderStats();

    // 5. 시각적 보정 (신문 본문에서 이미 찾은 단서들 하이라이트)
    this.engine.state.cluesFound.forEach(id => {
      const elements = document.querySelectorAll(`[data-clue="${id}"]`);
      elements.forEach(el => el.classList.add('found'));
    });

    console.log('🔄 Session restored for:', key);
  }

  // 단서 패널 토글 (모바일용)
  toggleCluePanel() {
    const panel = document.querySelector('.clue-panel');
    const overlay = document.getElementById('clue-panel-overlay');
    panel.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
    this.audio.play('click');
  }

  // 해결 목록 UI 업데이트
  updateSolvedUI() {
    Object.keys(this.engine.state.solved || {}).forEach(key => {
      const record = this.engine.state.solved[key];
      const isSolved = typeof record === 'object' ? record.solved : !!record;
      
      if (isSolved) {
        const item   = document.getElementById('np-item-' + key);
        const status = document.getElementById('np-status-' + key);
        if (item) item.classList.add('solved');
        
        if (status) {
          if (typeof record === 'object' && record.total) {
            status.innerHTML = `<span style="color:#c8a96e">✓ 해결됨</span> <span style="font-size:11px; color:#c8a96e; font-weight:bold;">(${record.count}/${record.total})</span>`;
          } else {
            status.textContent = '✓ 해결됨';
          }
        }
      }
    });
  }

  // ─────────────────────────────
  //  단서 재열람 (Context Re-view)
  // ─────────────────────────────
  showClueContext(clueId) {
    const ctx = this.engine.state.clueContexts[clueId];
    if (!ctx) return;

    document.getElementById('context-clue-title').textContent = ctx.label;
    document.getElementById('context-clue-desc').textContent  = ctx.desc;
    
    const body = document.getElementById('context-log-body');
    body.innerHTML = ctx.text.map(line => `
      <div class="log-line ${line.type}" style="font-size:13px; margin-bottom:4px; opacity:0.8;">${line.msg}</div>
    `).join('');

    const modal = document.getElementById('context-modal');
    modal.classList.add('active');

    const jumpBtn = document.getElementById('btn-jump-context');
    if (ctx.scene) {
      jumpBtn.style.display = 'block';
      jumpBtn.onclick = () => this.jumpToContext(clueId);
    } else {
      jumpBtn.style.display = 'none';
    }
  }

  jumpToContext(clueId) {
    const ctx = this.engine.state.clueContexts[clueId];
    if (!ctx) return;

    const key = this.engine.state.currentKey || Object.keys(this.newspapers).find(k => this.engine.state.solved[k]);
    if (!key) return;

    this.audio.play('click');
    document.getElementById('context-modal').classList.remove('active');

    // 시간 도약 시각 효과 시작
    document.body.classList.add('time-glitch-active');

    // 수사 재시작
    this.enterEra(key);

    // 랜딩 애니메이션 이후 점프 수행을 위한 훅
    // (약 2.4초 정도 소요되므로 setTimeout으로 타이밍을 맞춤)
    setTimeout(() => {
      // 시간 도약 시각 효과 종료
      document.body.classList.remove('time-glitch-active');

      if (ctx.scene === 'generic') {
        this._processChoice(key, ctx.choiceIdx);
      } else {
        const sceneFn = this.engine.getScene(ctx.scene);
        if (typeof sceneFn === 'function') {
          this.engine.logD();
          this.engine.log('system', '⏳ 시간의 파편을 통해 과거의 특정 시점으로 도약했습니다.');
          sceneFn();
        } else {
          this.engine.log('bad', '⚠️ 해당 시점의 기록이 손상되어 이동할 수 없습니다.');
        }
      }
    }, 2500);
  }
}
