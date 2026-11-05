// src/services/quickInput/search/Ranker.ts
import { QuickInputItem } from '../../../types/quickInput';
import { QuickInputCache } from '../QuickInputCache';
import { Matcher, MatchResult } from './Matcher';

export interface RankedItem {
  item: QuickInputItem;
  score: number;
}

export class Ranker {
  static rank(query: string, items: QuickInputItem[], providerId: string): QuickInputItem[] {
    if (!query) {
      // If no query, return items prioritizing MRU
      return this.sortByMru(items, providerId);
    }

    const mruList = QuickInputCache.getMru(providerId);
    const ranked: RankedItem[] = [];

    for (const item of items) {
      const match = Matcher.match(query, item.label, []);
      if (match.matched) {
        let finalScore = match.score;

        // MRU Boost
        const mruIndex = mruList.indexOf(item.id);
        if (mruIndex !== -1) {
          // Boost based on how recent it is (0 is most recent)
          finalScore += Math.max(10, 50 - mruIndex * 2);
        }

        ranked.push({ item, score: finalScore });
      }
    }

    // Sort descending by score
    ranked.sort((a, b) => b.score - a.score);

    return ranked.map((r) => r.item);
  }

  private static sortByMru(items: QuickInputItem[], providerId: string): QuickInputItem[] {
    const mruList = QuickInputCache.getMru(providerId);

    // Sort items so MRU items are at the top, maintaining their relative MRU order
    return [...items].sort((a, b) => {
      const aIndex = mruList.indexOf(a.id);
      const bIndex = mruList.indexOf(b.id);

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0; // maintain original order for non-MRU
    });
  }
}
