import { useTimelineStore } from '../../stores/ide/timelineStore';
import { TimelineProviderRegistry } from './TimelineProviderRegistry';
import { TimelineItem } from './types';
import { editorEventBus, EditorEvents } from '../../lib/editor/EditorEvents';
import { EditorManager } from '../editor/EditorManager';

class TimelineServiceImpl {
  private currentUri: string | null = null;
  private isVisible: boolean = false;

  public initialize() {
    editorEventBus.on(EditorEvents.EditorFocused, this.handleEditorChanged.bind(this));
    editorEventBus.on(EditorEvents.ModelChanged, this.handleModelChanged.bind(this));
  }

  public setVisibility(visible: boolean) {
    this.isVisible = visible;
    if (visible) {
      this.refresh();
    }
  }

  private handleEditorChanged() {
    const uri = EditorManager.adapter.getActiveEditorUri();
    if (uri !== this.currentUri) {
      this.currentUri = uri;
      this.refresh();
    }
  }

  private handleModelChanged() {
    // We could potentially refresh local history or wait for save
  }

  public async refresh() {
    if (!this.isVisible || !this.currentUri) return;

    useTimelineStore.getState().setIsLoading(true);

    try {
      const providers = TimelineProviderRegistry.getProvidersFor(this.currentUri);
      
      const promises = providers.map(p => 
        p.provideTimeline(this.currentUri!).catch(err => {
          console.error(`TimelineProvider ${p.id} failed`, err);
          return [] as TimelineItem[];
        })
      );

      const results = await Promise.all(promises);
      const allItems = results.flat();
      
      // Sort by timestamp descending (newest first)
      allItems.sort((a, b) => b.timestamp - a.timestamp);
      
      // Basic deduplication by ID
      const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());
      
      useTimelineStore.getState().setItems(uniqueItems);
    } catch (err: any) {
      console.error('Failed to refresh timeline', err);
      useTimelineStore.getState().setError(err.message || 'Failed to load timeline');
    } finally {
      useTimelineStore.getState().setIsLoading(false);
    }
  }
}

export const TimelineService = new TimelineServiceImpl();
