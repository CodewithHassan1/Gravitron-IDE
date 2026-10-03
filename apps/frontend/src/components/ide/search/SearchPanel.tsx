import React, { useEffect } from 'react';
import { useSearchStore } from '../../../stores/ide/searchStore';
import { NavigationEngine } from '../../../services/navigation/NavigationEngine';
import { SearchResults } from './SearchResults';
import { ReplacePanel } from './ReplacePanel';

export function SearchPanel() {
  const { query, setQuery, setResults, caseSensitive, wholeWord, regex } = useSearchStore();

  useEffect(() => {
    let active = true;
    if (query) {
      NavigationEngine.searchText(query, {
        isCaseSensitive: caseSensitive,
        isWordMatch: wholeWord,
        isRegex: regex
      }).then(results => {
        if (active) {
          setResults(results);
        }
      });
    } else {
      setResults([]);
    }
    return () => { active = false; };
  }, [query, caseSensitive, wholeWord, regex, setResults]);

  return (
    <div className="flex flex-col h-full bg-card select-none">
      <div className="flex flex-col px-4 pt-4 pb-2 shrink-0">
        <input
          type="text"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-7 px-2 text-xs bg-background border border-border focus:outline-none focus:border-primary transition-colors text-foreground mb-2"
        />
      </div>

      <ReplacePanel />

      <SearchResults />
    </div>
  );
}
