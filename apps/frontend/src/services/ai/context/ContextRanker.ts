import { ContextItem } from './ContextCollector';

const WEIGHTS: Record<string, number> = {
  'selection': 100,
  'file': 90,
  'editor': 70,
  'diff': 60,
  'diagnostic': 55,
  'search': 45,
  'reference': 40,
  'summary': 20
};

export class ContextRanker {
  static rank(items: ContextItem[]): ContextItem[] {
    return [...items].sort((a, b) => (WEIGHTS[b.type] || 0) - (WEIGHTS[a.type] || 0));
  }
}
