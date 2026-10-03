export class Scorer {
  static readonly EXACT_MATCH = 100;
  static readonly PREFIX_MATCH = 80;
  static readonly CAMEL_CASE_MATCH = 70;
  static readonly SUBSTRING_MATCH = 50;
  static readonly FUZZY_MATCH_BASE = 10;

  static calculateTypoPenalty(typos: number): number {
    return Math.max(0, 15 - (typos * 5));
  }

  static calculateGapPenalty(gaps: number): number {
    return Math.max(0, 10 - (gaps * 2));
  }
}
