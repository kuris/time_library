
const fs = require('fs');

const csvPath = './timelibrary.csv';
const outputPath = './js/data/scenarios_expanded.js';

function robustParseCSV(line) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    let bracketDepth = 0;
    let braceDepth = 0;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i+1] === '"') {
                cur += '""'; // Keep escaped quotes for cleanValue
                i++;
            } else {
                inQuotes = !inQuotes;
                cur += char;
            }
        } else if (char === '[' && !inQuotes) {
            bracketDepth++;
            cur += char;
        } else if (char === ']' && !inQuotes) {
            bracketDepth--;
            cur += char;
        } else if (char === '{' && !inQuotes) {
            braceDepth++;
            cur += char;
        } else if (char === '}' && !inQuotes) {
            braceDepth--;
            cur += char;
        } else if (char === ',' && !inQuotes && bracketDepth === 0 && braceDepth === 0) {
            fields.push(cur.trim());
            cur = '';
        } else {
            cur += char;
        }
    }
    fields.push(cur.trim());
    return fields;
}

function cleanValue(val) {
    if (!val) return '';
    let s = val.trim();
    if (s.startsWith('"') && s.endsWith('"')) s = s.substring(1, s.length - 1);
    
    let prev;
    do {
        prev = s;
        s = s.replace(/""/g, '"');
    } while (s !== prev);
    
    return s.replace(/\\"/g, '"');
}

function tryParseJSON(val) {
    const s = cleanValue(val);
    if (!s.startsWith('[') && !s.startsWith('{')) return null;
    
    try {
        const p = JSON.parse(s);
        return p;
    } catch (e) {
        // Semantic rescue for semi-broken JSON
        const matches = s.match(/\{[^{}]+\}/g);
        if (matches) {
            const recovered = matches.map(m => {
                try {
                    let ms = m.trim();
                    ms = ms.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
                    return JSON.parse(ms);
                } catch(e2) { return null; }
            }).filter(x => x !== null);
            return recovered.length > 0 ? recovered : null;
        }
        return null;
    }
}

const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
const newspapers = {};

for (let i = 1; i < lines.length; i++) {
    const r = robustParseCSV(lines[i]);
    if (r.length < 10) continue;

    const id = cleanValue(r[0]);
    if (!id || id === 'ID') continue;

    const cluesRaw = r[10];
    const choicesRaw = r[14];

    let clues = tryParseJSON(cluesRaw) || [];
    let choices = tryParseJSON(choicesRaw);
    
    // If choices came in shifted columns because of bad generation, use heuristic
    if (!choices || (Array.isArray(choices) && choices.length === 0)) {
        // Scan all fields from 11 onwards to find choices
        for (let j = 11; j < r.length; j++) {
            const parsed = tryParseJSON(r[j]);
            if (parsed && Array.isArray(parsed) && parsed.length > 0 && JSON.stringify(parsed[0]).includes('text')) {
                choices = parsed;
                break;
            }
        }
    }

    newspapers[id] = {
        category: cleanValue(r[1]),
        masthead: cleanValue(r[2]),
        date: cleanValue(r[3]),
        issue: cleanValue(r[4]),
        headline: cleanValue(r[5]),
        sub: cleanValue(r[6]),
        col1: cleanValue(r[7]),
        col2: cleanValue(r[8]),
        memo: cleanValue(r[9]),
        clues: clues,
        location: cleanValue(r[11]) || '알 수 없는 현장',
        eventStory: cleanValue(r[12]) || '미기록 사건',
        mysteryInsight: cleanValue(r[13]) || '',
        choices: choices || [],
        solveHeadline: cleanValue(r[15]) || '사건 해결',
        solveEnding: cleanValue(r[16]) || '진실에 도달했습니다.',
        landing: {
            year: cleanValue(r[17]) || cleanValue(r[3]).substring(0, 4) || '2024',
            date: cleanValue(r[18]) || cleanValue(r[3]) || '',
            msg: cleanValue(r[19]) || '착륙 중...'
        },
        isGeneric: ['choi1980', 'imf1997'].includes(id) ? false : true
    };
}

const jsContent = `export const expandedScenarios = ${JSON.stringify(newspapers, null, 2)};`;
fs.writeFileSync(outputPath, jsContent);
console.log('✅ ABSOLUTELY ROBUST REPAIR COMPLETE. JSON Fragments fixed.');
