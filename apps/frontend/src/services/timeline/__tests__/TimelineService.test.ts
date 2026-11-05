import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TimelineService } from '../TimelineService';
import { TimelineProviderRegistry } from '../TimelineProviderRegistry';
import { useTimelineStore } from '../../../stores/ide/timelineStore';
import { TimelineProvider, TimelineItem } from '../types';

describe('TimelineService', () => {
  beforeEach(() => {
    useTimelineStore.setState({ items: [], isLoading: false });
    vi.clearAllMocks();
  });

  it('should lazy load from multiple providers and sort properly', async () => {
    const p1: TimelineProvider = {
      id: 'p1',
      canProvide: () => true,
      provideTimeline: async () => [
        {
          id: '1',
          timestamp: 1000,
          provider: 'p1',
          type: 't',
          title: 'A',
          description: '',
          icon: '',
          metadata: {},
        },
      ],
    };

    const p2: TimelineProvider = {
      id: 'p2',
      canProvide: () => true,
      provideTimeline: async () => [
        {
          id: '2',
          timestamp: 2000,
          provider: 'p2',
          type: 't',
          title: 'B',
          description: '',
          icon: '',
          metadata: {},
        },
      ],
    };

    TimelineProviderRegistry.register(p1);
    TimelineProviderRegistry.register(p2);

    TimelineService.setVisibility(true); // Should trigger refresh

    // We can manually trigger it to await
    (TimelineService as any).currentUri = 'file:///test.ts';
    await TimelineService.refresh();

    const items = useTimelineStore.getState().items;

    expect(items.length).toBe(2);
    // Should be sorted by timestamp descending
    expect(items[0].id).toBe('2');
    expect(items[1].id).toBe('1');

    TimelineProviderRegistry.unregister('p1');
    TimelineProviderRegistry.unregister('p2');
  });
});
