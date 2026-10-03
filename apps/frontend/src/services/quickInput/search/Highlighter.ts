// src/services/quickInput/search/Highlighter.ts
export interface HighlightSpan {
  start: number;
  end: number;
}

export class Highlighter {
  static highlight(query: string, target: string): HighlightSpan[] {
    if (!query || !target) return [];
    
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();
    
    // 1. Exact or Substring match
    const startIdx = targetLower.indexOf(queryLower);
    if (startIdx !== -1) {
      return [{ start: startIdx, end: startIdx + query.length }];
    }
    
    // 2. Fuzzy Match (find each character in order)
    const spans: HighlightSpan[] = [];
    let queryIdx = 0;
    
    for (let targetIdx = 0; targetIdx < targetLower.length; targetIdx++) {
      if (queryIdx < queryLower.length && targetLower[targetIdx] === queryLower[queryIdx]) {
        // We found a char. See if we can extend the current span
        if (spans.length > 0 && spans[spans.length - 1].end === targetIdx) {
          spans[spans.length - 1].end = targetIdx + 1;
        } else {
          spans.push({ start: targetIdx, end: targetIdx + 1 });
        }
        queryIdx++;
      }
    }
    
    if (queryIdx === queryLower.length) {
      return spans;
    }
    
    return []; // No complete match found
  }
}
