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

    try {
      // 1. 구글 시트 복사-붙여넣기 시 발생하는 따옴표 중첩 보정 로직
      // 앞뒤가 따옴표로 감싸져 있고 내부도 따옴표 지옥인 경우를 처리
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        // 내부의 "" 를 " 로 변환하기 전에, 이중/삼중 이스케이프된 것을 먼저 정리
        // 8개/4개씩 겹친 따옴표를 2개로 압축
        cleaned = cleaned.replace(/"{4,}/g, '""');
      }

      // JSON 표준에 맞게 파싱 시도
      return JSON.parse(cleaned);
    } catch (e) {
      // 2. 최후의 수단: 모든 연속된 따옴표 및 역슬래시 강제 치환 (가장 강력한 보정)
      try {
        console.log('⚠️ JSON 심폐소생술 모드 가동 중...');
        let brute = cleaned;
        
        // 역슬래시(\) 제거 (Gemini가 잘못 넣은 이스케이프 제거)
        brute = brute.replace(/\\"/g, '"');
        brute = brute.replace(/\\/g, '');

        // 앞뒤 따옴표 정리
        if (brute.startsWith('"') && brute.endsWith('"')) {
          brute = brute.substring(1, brute.length - 1);
        }
        
        // 연속된 따옴표 압축
        brute = brute.replace(/"+/g, '"');
        
        // 양 끝에 대괄호나 중괄호가 없다면 추가 시도 (파손 복구)
        if (!brute.startsWith('[') && !brute.startsWith('{')) {
           // 데이터 형태에 따라 유추 (Clues는 [], Choices는 [])
           // 일단은 에러 로그만 찍고 반환
        }

        return JSON.parse(brute);
      } catch (e2) {
        console.warn('❌ 완전 파손된 JSON 데이터:', cleaned);
        return fallback;
      }
    }
  }
}
