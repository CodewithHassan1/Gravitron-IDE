export class SearchHistoryImpl {
  private history: string[] = [];

  add(query: string) {
    this.history = [query, ...this.history.filter(q => q !== query)].slice(0, 50);
  }

  getHistory(): string[] {
    return this.history;
  }

  clear() {
    this.history = [];
  }
}

export const SearchHistory = new SearchHistoryImpl();
