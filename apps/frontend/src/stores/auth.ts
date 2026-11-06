import { create } from 'zustand';

export type AuthStatus =
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'PENDING_VERIFICATION'
  | 'DISABLED'
  | 'SESSION_EXPIRED';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: any | null;
  login: (accessToken: string, user: any, status: AuthStatus) => void;
  logout: () => void;
  setStatus: (status: AuthStatus) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'UNAUTHENTICATED',
  accessToken: null,
  user: null,
  login: (accessToken, user, status) => set({ accessToken, user, status }),
  logout: () => set({ accessToken: null, user: null, status: 'UNAUTHENTICATED' }),
  setStatus: (status) => set({ status }),
}));
