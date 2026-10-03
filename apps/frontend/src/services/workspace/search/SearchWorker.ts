// src/services/workspace/search/SearchWorker.ts

import { SearchIndex } from './SearchIndex';
import { WorkerMessage, WorkerResponse, IndexNodePayload, SearchPayload, SearchResult } from './SearchTypes';
import { SearchQuery } from './SearchQuery';

const index = new SearchIndex();

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'INDEX_NODE': {
        const nodePayload = payload as IndexNodePayload;
        index.addNode(nodePayload);
        
        const response: WorkerResponse = { id, type: 'INDEX_COMPLETE' };
        self.postMessage(response);
        break;
      }
      case 'REMOVE_NODE': {
        const nodeId = payload as string;
        index.removeNode(nodeId);
        
        const response: WorkerResponse = { id, type: 'INDEX_COMPLETE' };
        self.postMessage(response);
        break;
      }
      case 'CLEAR': {
        index.clear();
        
        const response: WorkerResponse = { id, type: 'INDEX_COMPLETE' };
        self.postMessage(response);
        break;
      }
      case 'SEARCH': {
        const searchPayload = payload as SearchPayload;
        const query = new SearchQuery(searchPayload.query, {
          fileTypes: searchPayload.fileTypes,
          includeHidden: searchPayload.includeHidden,
          maxResults: searchPayload.maxResults,
        });

        const results = index.search(query);
        
        const response: WorkerResponse<SearchResult[]> = { 
          id, 
          type: 'SEARCH_RESULTS', 
          payload: results 
        };
        self.postMessage(response);
        break;
      }
      default:
        console.warn(`[SearchWorker] Unknown command type: ${type}`);
    }
  } catch (error: any) {
    const errorResponse: WorkerResponse = {
      id,
      type: 'ERROR',
      error: error.message || 'Unknown error in SearchWorker',
    };
    self.postMessage(errorResponse);
  }
};
