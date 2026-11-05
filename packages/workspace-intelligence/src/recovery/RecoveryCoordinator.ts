import { ReplayEngine } from './ReplayEngine';
import { IRepositoryModel } from '../interfaces/IRepositoryModel';
import { WorkspaceId } from '../models/EntityIds';
import { IRepositoryEventBus, EventDeliveryMode } from '../interfaces/IRepositoryEventBus';
import { RepositoryEventType } from '../events/RepositoryEvent';

export interface RecoveryResult {
  success: boolean;
  restoredModel?: IRepositoryModel;
  errorMessage?: string;
}

export class RecoveryCoordinator {
  constructor(
    private replayEngine: ReplayEngine,
    private eventBus: IRepositoryEventBus
  ) {}

  async recoverWorkspace(
    workspaceId: WorkspaceId,
    lastGoodModel: IRepositoryModel,
    fromSequenceNumber: number
  ): Promise<RecoveryResult> {
    try {
      this.eventBus.publish(
        {
          type: RepositoryEventType.RecoveryStarted,
          eventId: `rec-start-${Date.now()}`,
          workspaceId,
          sequenceNumber: -1, // typically out-of-band sequence
          timestamp: Date.now(),
          reason: 'Worker crashed',
        },
        EventDeliveryMode.RECOVERY
      );

      const restoredModel = await this.replayEngine.replay(lastGoodModel, {
        workspaceId,
        fromSequenceNumber,
      });

      this.eventBus.publish(
        {
          type: RepositoryEventType.RecoveryCompleted,
          eventId: `rec-end-${Date.now()}`,
          workspaceId,
          sequenceNumber: -1,
          timestamp: Date.now(),
          restoredSequenceNumber: restoredModel.getSnapshot().sequenceNumber,
        },
        EventDeliveryMode.RECOVERY
      );

      return { success: true, restoredModel };
    } catch (e: any) {
      return { success: false, errorMessage: e.message };
    }
  }
}
