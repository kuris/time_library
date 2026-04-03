// ══════════════════════════════
//  js/DataLoader.js
//  Google Sheets CSV 데이터를 가져오고 파싱
// ══════════════════════════════

export class DataLoader {
  constructor(sheetId, gid = '0') {
    this.csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  async loadScenarios() {
    try {
      const response = await fetch(this.csvUrl);
      if (!response.ok) throw new Error('구글 시트 데이터를 가져오는데 실패했습니다.');
      
      const csvText = await response.text();
      return this.parseCSV(csvText);
    } catch (err) {
      console.error('DataLoader Error:', err);
      return null;
    }
  }

  parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return {};

    // 헤더 추출
    const headers = this.splitCSVLine(lines[0]);
    const newspapers = {};

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = this.splitCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      if (!row.ID) continue;

      // 데이터 매핑 및 역직렬화 (JSON)
      newspapers[row.ID] = {
        masthead: row.Masthead,
        date:     row.Date,
        issue:    row.Issue,
        headline: row.Headline,
        sub:      row.Subtitle,
        col1:     row.Col1,
        col2:     row.Col2,
        memo:     row.Memo,
        clues:    this.safeParseJSON(row.Clues, []),
        location: row.Location,
        eventStory: row.Story,
        mysteryInsight: row.Insight,
        choices:  this.safeParseJSON(row.Choices, []),
        solveHeadline: row.SolveHeadline,
        solveEnding:   row.SolveEnding,
        landing: {
          year: row.LandingYear,
          date: row.LandingDate,
          msg:  row.LandingMsg
        },
        isGeneric: row.isGeneric === 'true',
        category: row.Category
      };
    }

    return newspapers;
  }

  // 간단한 CSV 라인 파서 (따옴표 내 쉼표 처리)
  splitCSVLine(line) {
    const result = [];
    let start = 0;
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === ',' && !inQuotes) {
        result.push(this.cleanValue(line.substring(start, i)));
        start = i + 1;
      }
    }
    result.push(this.cleanValue(line.substring(start)));
    return result;
  }

  cleanValue(val) {
    val = val.trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1).replace(/""/g, '"');
    }
    return val;
  }

  safeParseJSON(str, fallback) {
    if (!str || str.trim() === '') return fallback;
    let cleaned = str.trim();

    // 1. 기초 청소 (따옴표 압축 및 역슬래시 제거)
    cleaned = cleaned.replace(/\\"/g, '"').replace(/\\/g, '');
    cleaned = cleaned.replace(/"{2,}/g, '"'); // 2개 이상의 연속된 따옴표를 하나로

    // 2. 앞뒤에 붙은 불필요한 따옴표 제거 (CSV 파생물)
    if (cleaned.startsWith('"')) cleaned = cleaned.substring(1);
    if (cleaned.endsWith('"')) cleaned = cleaned.substring(0, cleaned.length - 1);

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // 3. 심폐소생술: 정규식을 이용해 유효한 { } 객체들만이라도 추출
      try {
        console.log('💊 데이터 복구 시도 중...');
        // { "key": "value" ... } 형태를 찾아냄
        const matches = cleaned.match(/\{[^{}]+\}/g);
        if (matches && matches.length > 0) {
          const recovered = matches.map(m => {
            try {
              // 개별 객체에 대해 한 번 더 청소 후 파싱
              let objStr = m.trim();
              if (!objStr.endsWith('}')) objStr += '}';
              return JSON.parse(objStr);
            } catch (innerE) { return null; }
          }).filter(x => x !== null);

          if (recovered.length > 0) return recovered;
        }
      } catch (e3) { /* 실패 시 다음 단계로 */ }

      // 4. 최후의 수단: 잘린 데이터 복구 (중괄호/대괄호 밸런싱)
      try {
        let repaired = cleaned;
        if (repaired.startsWith('[') && !repaired.endsWith(']')) repaired += ']';
        if (repaired.startsWith('{') && !repaired.endsWith('}')) repaired += '}';
        // 다시 시도
        return JSON.parse(repaired);
      } catch (e4) {
        console.warn('❌ 완전 파손된 데이터 (복구 불가능):', cleaned.substring(0, 50) + '...');
        return fallback;
      }
    }
  }
}
