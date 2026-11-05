// src/services/quickInput/QuickInputRouter.ts
import { QuickInputProvider } from '../../types/quickInput';
import { QuickInputRegistry } from './QuickInputRegistry';

export interface RouteResult {
  provider: QuickInputProvider | null;
  strippedQuery: string;
  prefix: string;
}

class QuickInputRouterImpl {
  route(query: string): RouteResult {
    const providers = QuickInputRegistry.getAllProviders();

    // Check for explicit prefix matches first
    for (const provider of providers) {
      for (const prefix of provider.metadata.prefixes) {
        if (prefix.length > 0 && query.startsWith(prefix)) {
          return {
            provider,
            strippedQuery: query.slice(prefix.length).trimStart(),
            prefix,
          };
        }
      }
    }

    // No explicit prefix matched, fallback to the provider that supports empty queries (usually FileProvider)
    const fallbackProvider = providers.find((p) => p.metadata.supportsEmptyQuery) || null;

    return {
      provider: fallbackProvider,
      strippedQuery: query,
      prefix: '',
    };
  }
}

export const QuickInputRouter = new QuickInputRouterImpl();
