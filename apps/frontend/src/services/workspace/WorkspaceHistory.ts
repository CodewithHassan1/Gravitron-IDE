import { WorkspaceSnapshot } from './types';

export class WorkspaceHistory {
  private past: WorkspaceSnapshot[] = [];
  private present: WorkspaceSnapshot | null = null;
  private future: WorkspaceSnapshot[] = [];

  private readonly maxHistory: number;

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  /**
   * Initializes the history with the starting snapshot
   */
  public init(snapshot: WorkspaceSnapshot) {
    this.past = [];
    this.future = [];
    this.present = snapshot;
  }

  /**
   * Pushes a new snapshot into the history, clearing the future stack
   */
  public push(snapshot: WorkspaceSnapshot) {
    if (this.present) {
      this.past.push(this.present);
      if (this.past.length > this.maxHistory) {
        this.past.shift();
      }
    }
    this.present = snapshot;
    this.future = [];
  }

  /**
   * Undoes the last action, returning the previous snapshot if available
   */
  public undo(): WorkspaceSnapshot | null {
    if (this.past.length === 0 || !this.present) {
      return null;
    }

    this.future.unshift(this.present);
    this.present = this.past.pop()!;
    return this.present;
  }

  /**
   * Redoes the next action, returning the future snapshot if available
   */
  public redo(): WorkspaceSnapshot | null {
    if (this.future.length === 0 || !this.present) {
      return null;
    }

    this.past.push(this.present);
    this.present = this.future.shift()!;
    return this.present;
  }

  public get canUndo(): boolean {
    return this.past.length > 0;
  }

  public get canRedo(): boolean {
    return this.future.length > 0;
  }

  public clear() {
    this.past = [];
    this.present = null;
    this.future = [];
  }
}
