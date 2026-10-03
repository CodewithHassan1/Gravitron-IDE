export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

export class MatchHighlighter {
  static highlight(text: string, indices: number[]): HighlightSegment[] {
    if (!indices || indices.length === 0) {
      return [{ text, isMatch: false }];
    }

    const segments: HighlightSegment[] = [];
    let currentSegmentText = '';
    let isCurrentlyMatching = indices.includes(0);

    for (let i = 0; i < text.length; i++) {
      const isMatch = indices.includes(i);

      if (isMatch !== isCurrentlyMatching) {
        if (currentSegmentText) {
          segments.push({ text: currentSegmentText, isMatch: isCurrentlyMatching });
        }
        currentSegmentText = text[i];
        isCurrentlyMatching = isMatch;
      } else {
        currentSegmentText += text[i];
      }
    }

    if (currentSegmentText) {
      segments.push({ text: currentSegmentText, isMatch: isCurrentlyMatching });
    }

    return segments;
  }
}
