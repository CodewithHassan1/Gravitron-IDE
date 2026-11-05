import { AgentProtocol } from '@ag/protocol';

export class AgentStateMachine {
  private _state: AgentProtocol.AgentState;

  constructor() {
    this._state = AgentProtocol.AgentState.Idle;
  }

  get state(): AgentProtocol.AgentState {
    return this._state;
  }

  public transition(newState: AgentProtocol.AgentState): void {
    if (!this.isValidTransition(this._state, newState)) {
      throw new Error(`Invalid state transition from ${this._state} to ${newState}`);
    }
    this._state = newState;
  }

  private isValidTransition(from: AgentProtocol.AgentState, to: AgentProtocol.AgentState): boolean {
    const { AgentState } = AgentProtocol;

    // Terminal states cannot transition to anything else
    if (
      from === AgentState.Completed ||
      from === AgentState.Failed ||
      from === AgentState.Cancelled
    ) {
      return false;
    }

    // Any state (except terminal) can transition to Cancelled or Failed
    if (to === AgentState.Cancelled || to === AgentState.Failed) {
      return true;
    }

    switch (from) {
      case AgentState.Idle:
        return to === AgentState.Planning;

      case AgentState.Planning:
        return to === AgentState.CallingProvider || to === AgentState.Completed;

      case AgentState.CallingProvider:
        return to === AgentState.Streaming || to === AgentState.Completed;

      case AgentState.Streaming:
        return (
          to === AgentState.ToolCallPending ||
          to === AgentState.Completed ||
          to === AgentState.Planning
        );

      case AgentState.ToolCallPending:
        return to === AgentState.AwaitingApproval || to === AgentState.ExecutingTool;

      case AgentState.AwaitingApproval:
        return (
          to === AgentState.ExecutingTool ||
          to === AgentState.Planning ||
          to === AgentState.Completed
        );

      case AgentState.ExecutingTool:
        return to === AgentState.Planning || to === AgentState.Completed;

      default:
        return false;
    }
  }
}
