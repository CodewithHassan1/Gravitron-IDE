import { create } from 'zustand';
import { AgentProtocol } from '@ag/protocol';

interface AgentUIState {
  activeAgentId: string | null;
  agentState: AgentProtocol.AgentState;
  setActiveAgentId: (id: string | null) => void;
  setAgentState: (state: AgentProtocol.AgentState) => void;
}

export const useAgentStore = create<AgentUIState>((set) => ({
  activeAgentId: null,
  agentState: AgentProtocol.AgentState.Idle,
  setActiveAgentId: (id) => set({ activeAgentId: id }),
  setAgentState: (state) => set({ agentState: state }),
}));


