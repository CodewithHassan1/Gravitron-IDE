export interface TimelineItem {
  id: string;
  timestamp: number;
  provider: string; // e.g. 'git', 'local', 'ai'
  type: string;
  title: string;
  description: string;
  icon: string;
  command?: string;
  metadata: Record<string, any>; // Extensible payload for hashes, snapshotIds, prompts, etc.
}

export interface TimelineProvider {
  /**
   * The unique ID of the provider (e.g. 'git', 'local', 'ai')
   */
  id: string;

  /**
   * Whether this provider can provide history for the given URI
   */
  canProvide(uri: string): boolean;

  /**
   * Fetch timeline items for the given URI
   */
  provideTimeline(uri: string, limit?: number): Promise<TimelineItem[]>;
}
