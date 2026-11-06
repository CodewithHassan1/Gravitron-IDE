import { describe, it, expect } from 'vitest';
import { AgentStateMachine } from '../src/AgentStateMachine';
import { AgentProtocol } from '@ag/protocol';

describe('AgentStateMachine', () => {
  it('starts in Idle state', () => {
    const sm = new AgentStateMachine();
    expect(sm.state).toBe(AgentProtocol.AgentState.Idle);
  });

  it('allows valid transitions', () => {
    const sm = new AgentStateMachine();

    // Valid standard flow
    sm.transition(AgentProtocol.AgentState.Planning);
    expect(sm.state).toBe(AgentProtocol.AgentState.Planning);

    sm.transition(AgentProtocol.AgentState.CallingProvider);
    sm.transition(AgentProtocol.AgentState.Streaming);
    sm.transition(AgentProtocol.AgentState.ToolCallPending);
    sm.transition(AgentProtocol.AgentState.ExecutingTool);
    sm.transition(AgentProtocol.AgentState.Planning);
    sm.transition(AgentProtocol.AgentState.Completed);
    expect(sm.state).toBe(AgentProtocol.AgentState.Completed);
  });

  it('allows transitioning to Failed or Cancelled from active states', () => {
    const sm = new AgentStateMachine();
    sm.transition(AgentProtocol.AgentState.Planning);
    sm.transition(AgentProtocol.AgentState.Cancelled);
    expect(sm.state).toBe(AgentProtocol.AgentState.Cancelled);
  });

  it('throws on invalid transitions', () => {
    const sm = new AgentStateMachine();

    // Idle -> CallingProvider is invalid
    expect(() => sm.transition(AgentProtocol.AgentState.CallingProvider)).toThrow(
      'Invalid state transition'
    );
  });

  it('prevents transitioning out of terminal states', () => {
    const sm = new AgentStateMachine();
    sm.transition(AgentProtocol.AgentState.Planning);
    sm.transition(AgentProtocol.AgentState.Completed);

    expect(() => sm.transition(AgentProtocol.AgentState.Planning)).toThrow(
      'Invalid state transition'
    );
  });
});
