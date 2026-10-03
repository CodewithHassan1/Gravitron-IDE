import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Global test setup for Vitest
// Mock Web Worker for WorkspaceSearchService

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((error: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  postMessage(message: any): void {
    // Simulate async response
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({ data: message, target: this } as unknown as MessageEvent);
      }
    }, 0);
  }

  terminate(): void {
    // No-op
  }

  addEventListener(type: string, listener: EventListener): void {
    // No-op
  }

  removeEventListener(type: string, listener: EventListener): void {
    // No-op
  }

  dispatchEvent(event: Event): boolean {
    return true;
  }
}

// @ts-ignore - Global mock
global.Worker = MockWorker;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, writable: true });
