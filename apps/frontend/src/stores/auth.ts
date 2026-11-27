import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  refreshToken: string | null;
  user: any | null;
  login: (accessToken: string, user: any, status: AuthStatus, refreshToken?: string) => void;
  updateTokens: (accessToken: string, refreshToken?: string) => void;
  logout: () => void;
  setStatus: (status: AuthStatus) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      status: 'UNAUTHENTICATED',
      accessToken: null,
      refreshToken: null,
      user: null,
      login: (accessToken, user, status, refreshToken) => {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('ag_access_token', accessToken);
            if (refreshToken) {
              localStorage.setItem('ag_refresh_token', refreshToken);
            }
          } catch {
            // Ignore quota errors
          }
        }
        set({ accessToken, refreshToken: refreshToken ?? null, user, status });
      },
      updateTokens: (accessToken, refreshToken) => {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('ag_access_token', accessToken);
            if (refreshToken) {
              localStorage.setItem('ag_refresh_token', refreshToken);
            }
          } catch {
            // Ignore quota errors
          }
        }
        set((state) => ({
          accessToken,
          refreshToken: refreshToken ?? state.refreshToken,
          status: 'AUTHENTICATED',
        }));
      },
      logout: () => {
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('ag_access_token');
            localStorage.removeItem('ag_refresh_token');
          } catch {
            // Ignore
          }
        }
        set({ accessToken: null, refreshToken: null, user: null, status: 'UNAUTHENTICATED' });
      },
      setStatus: (status) => set({ status }),
    }),
    {
      name: 'ag_auth_session',
    }
  )
);
