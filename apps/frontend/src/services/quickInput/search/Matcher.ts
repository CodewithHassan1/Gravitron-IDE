// src/services/quickInput/search/Matcher.ts
import { Scorer } from './Scorer';

export interface MatchResult {
  matched: boolean;
  score: number;
}

export class Matcher {
  static match(query: string, target: string, aliases: string[] = []): MatchResult {
    if (!query) return { matched: true, score: 0 };
    if (!target) return { matched: false, score: 0 };

    let bestScore = this.computeScore(query, target);

    // Check aliases
    for (const alias of aliases) {
      const aliasScore = this.computeScore(query, alias);
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
      }
    }

    return {
      matched: bestScore > 0,
      score: bestScore,
    };
  }

  private static computeScore(query: string, target: string): number {
    const exact = Scorer.scoreExactMatch(query, target);
    if (exact > 0) return exact;

    const prefix = Scorer.scorePrefixMatch(query, target);
    if (prefix > 0) return prefix;

    const acronym = Scorer.scoreAcronymMatch(query, target);
    if (acronym > 0) return acronym;

    const substring = Scorer.scoreSubstringMatch(query, target);
    if (substring > 0) return substring;

    const fuzzy = Scorer.scoreFuzzy(query, target);
    return fuzzy;
  }
}
