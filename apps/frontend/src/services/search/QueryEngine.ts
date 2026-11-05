import { IndexService, IndexItem } from './IndexService';
import { Matcher, MatchResult } from '../../lib/search/Matcher';
import { Ranking } from '../../lib/search/Ranking';
import { SearchQuery } from '../../lib/search/SearchQuery';

export interface RankedResult {
  item: IndexItem;
  match: MatchResult;
  score: number;
}

export class QueryEngineImpl {
  search(query: string, types?: string[]): RankedResult[] {
    const items = IndexService.getAllItems();
    const results: RankedResult[] = [];

    const isFuzzy = !query.includes('*') && !query.includes('^');

    for (const item of items) {
      if (types && !types.includes(item.type)) continue;

      let match: MatchResult;

      if (isFuzzy) {
        // Use custom fuzzy matcher
        match = Matcher.fuzzyMatch(query, item.title);
      } else {
        // Regex / Literal match
        const sq = new SearchQuery(query, { useRegex: true });
        const matched = sq.test(item.title);
        match = { matched, score: matched ? 100 : 0, indices: [] };
      }

      if (match.matched) {
        // Here we'd integrate RankContext (recent access, frequency)
        const score = Ranking.rank(match, {});
        results.push({ item, match, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 500); // virtualized, but capped at 500 top results
  }
}

export const QueryEngine = new QueryEngineImpl();
