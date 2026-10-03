import { TimelineProvider, TimelineItem } from '../types';

class AITimelineProviderImpl implements TimelineProvider {
  public readonly id = 'ai';

  canProvide(uri: string): boolean {
    return true;
  }

  async provideTimeline(uri: string, limit: number = 50): Promise<TimelineItem[]> {
    // Return empty array for now, waiting for actual AI engine integration
    return [];
  }
}

export const AITimelineProvider = new AITimelineProviderImpl();
