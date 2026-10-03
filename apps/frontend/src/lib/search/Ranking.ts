import { MatchResult } from './Matcher';

export interface RankContext {
  lastAccessed?: number; // timestamp
  frequency?: number;
  isOpen?: boolean;
}

export class Ranking {
  static rank(match: MatchResult, context: RankContext): number {
    let score = match.score;

    if (context.isOpen) {
      score += 20; // Boost open files
    }

    if (context.lastAccessed) {
      const hoursSinceAccess = (Date.now() - context.lastAccessed) / (1000 * 60 * 60);
      if (hoursSinceAccess < 1) score += 15;
      else if (hoursSinceAccess < 24) score += 5;
    }

    if (context.frequency) {
      score += Math.min(10, context.frequency);
    }

    return score;
  }
}
