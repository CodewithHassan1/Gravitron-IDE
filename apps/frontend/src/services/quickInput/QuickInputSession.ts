// src/services/quickInput/QuickInputSession.ts
import { QuickInputItem, QuickInputProvider } from '../../types/quickInput';
import { QuickInputRouter } from './QuickInputRouter';
import { QuickInputEventBus, QuickInputEventType } from './QuickInputEventBus';
import { QuickInputCache } from './QuickInputCache';

export interface QuickInputState {
  isOpen: boolean;
  query: string;
  items: QuickInputItem[];
  selectedIndex: number;
  isLoading: boolean;
  activeProvider: QuickInputProvider | null;
  error: Error | null;
}

class QuickInputSessionImpl {
  private state: QuickInputState = {
    isOpen: false,
    query: '',
    items: [],
    selectedIndex: 0,
    isLoading: false,
    activeProvider: null,
    error: null,
  };

  private abortController: AbortController | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  getState() {
    return this.state;
  }

  setOpen(isOpen: boolean, initialQuery: string = '') {
    this.state.isOpen = isOpen;
    if (isOpen) {
      QuickInputEventBus.publish(QuickInputEventType.QuickInputOpened, undefined);
      this.setQuery(initialQuery);
    } else {
      this.cancelSearch();
      if (this.state.activeProvider?.clearPreview) {
        this.state.activeProvider.clearPreview();
      }
      QuickInputEventBus.publish(QuickInputEventType.QuickInputClosed, undefined);
    }
  }

  setQuery(query: string) {
    this.state.query = query;
    const route = QuickInputRouter.route(query);

    if (this.state.activeProvider !== route.provider) {
      if (this.state.activeProvider?.clearPreview) {
        this.state.activeProvider.clearPreview();
      }
      this.state.activeProvider = route.provider;
      if (route.provider) {
        QuickInputEventBus.publish(QuickInputEventType.ProviderChanged, { providerId: route.provider.metadata.id });
      }
    }

    QuickInputEventBus.publish(QuickInputEventType.QueryChanged, { query: route.strippedQuery, prefix: route.prefix });

    this.executeSearch(route.strippedQuery, route.provider);
  }

  private executeSearch(strippedQuery: string, provider: QuickInputProvider | null) {
    this.cancelSearch();
    this.state.items = [];
    this.state.selectedIndex = 0;
    this.state.error = null;

    if (!provider) {
      QuickInputEventBus.publish(QuickInputEventType.ItemsUpdated, { count: 0 });
      return;
    }

    // Check Cache
    const cacheKey = `${provider.metadata.id}::${strippedQuery}`;
    const cachedItems = QuickInputCache.get<QuickInputItem[]>(cacheKey, 'search');
    if (cachedItems) {
      this.state.items = cachedItems;
      QuickInputEventBus.publish(QuickInputEventType.ItemsUpdated, { count: cachedItems.length });
      return;
    }

    this.state.isLoading = true;
    QuickInputEventBus.publish(QuickInputEventType.LoadingStarted, undefined);

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Debounce to prevent layout thrashing
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    
    this.debounceTimer = setTimeout(async () => {
      try {
        const items = await provider.search(strippedQuery, signal);
        if (!signal.aborted) {
          this.state.items = items;
          this.state.isLoading = false;
          QuickInputCache.set(cacheKey, items, 'search');
          QuickInputEventBus.publish(QuickInputEventType.LoadingFinished, undefined);
          QuickInputEventBus.publish(QuickInputEventType.ItemsUpdated, { count: items.length });
          
          if (items.length > 0) {
            this.setSelectedIndex(0);
          }
        }
      } catch (err: any) {
        if (!signal.aborted) {
          this.state.error = err;
          this.state.isLoading = false;
          QuickInputEventBus.publish(QuickInputEventType.LoadingFinished, undefined);
          QuickInputEventBus.publish(QuickInputEventType.ProviderError, { error: err, providerId: provider.metadata.id });
        }
      }
    }, 150);
  }

  setSelectedIndex(index: number) {
    if (this.state.items.length === 0) return;
    this.state.selectedIndex = Math.max(0, Math.min(index, this.state.items.length - 1));
    const item = this.state.items[this.state.selectedIndex];
    QuickInputEventBus.publish(QuickInputEventType.SelectionChanged, { index: this.state.selectedIndex, itemId: item.id });
    
    if (this.state.activeProvider?.preview) {
      this.state.activeProvider.preview(item).catch(err => console.error("Preview failed:", err));
    }
  }

  async executeSelected() {
    if (this.state.items.length === 0 || !this.state.activeProvider) return;
    const item = this.state.items[this.state.selectedIndex];
    
    try {
      this.setOpen(false); // Close immediately upon execution
      await this.state.activeProvider.execute(item);
      QuickInputEventBus.publish(QuickInputEventType.ItemExecuted, { itemId: item.id, providerId: this.state.activeProvider.metadata.id });
      QuickInputCache.addMru(this.state.activeProvider.metadata.id, item.id);
    } catch (err) {
      console.error("Execution failed:", err);
    }
  }

  cancelSearch() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.state.isLoading) {
      this.state.isLoading = false;
      QuickInputEventBus.publish(QuickInputEventType.LoadingFinished, undefined);
    }
  }
}

export const QuickInputSession = new QuickInputSessionImpl();
