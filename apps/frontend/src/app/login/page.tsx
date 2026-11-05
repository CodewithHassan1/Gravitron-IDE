'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/auth';
import { getErrorMessage } from '../../utils/errors';
import { getGatewayUrl, getAuthClient, isProductionRuntime } from '../../utils/gateway';
import { GatewaySetupModal } from '../../components/auth/GatewaySetupModal';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const setStatus = useAuthStore((state) => state.setStatus);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentGatewayUrl, setCurrentGatewayUrl] = useState<string | null>(null);

  useEffect(() => {
    setCurrentGatewayUrl(getGatewayUrl());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setStatus('AUTHENTICATING');
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const client = getAuthClient();
      const res = await client.passwordLogin({ email: normalizedEmail, password });

      if (res.status === 'PENDING_VERIFICATION') {
        login(res.accessToken, { email: normalizedEmail }, 'PENDING_VERIFICATION');
        router.push('/verify-email');
      } else {
        login(res.accessToken, { email: normalizedEmail }, 'AUTHENTICATED');
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setStatus('UNAUTHENTICATED');
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-2xl font-bold">Sign In</h2>
        <p className="text-muted-foreground text-sm">Sign in to access your workspaces.</p>

        {!currentGatewayUrl && isProductionRuntime() && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-500 space-y-2">
            <div className="font-semibold">Gateway Not Configured</div>
            <p>A production Gateway URL must be configured before you can sign in.</p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="rounded bg-amber-500 text-black px-2.5 py-1 font-medium hover:bg-amber-400 transition-colors"
            >
              Configure Gateway
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive space-y-1">
            <p className="font-medium">{error}</p>
            {error.includes('Gateway URL is not configured') && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="text-xs font-semibold text-primary underline"
              >
                Configure Server Endpoint
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="text-sm text-center">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-blue-500">
            Register
          </Link>
        </div>
        <div className="text-sm text-center">
          <Link href="/forgot-password" className="text-blue-500">
            Forgot Password?
          </Link>
        </div>

        <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate max-w-[210px]" title={currentGatewayUrl || 'Not configured'}>
            Server: <span className="font-mono">{currentGatewayUrl || 'Not configured'}</span>
          </span>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="text-primary hover:underline font-medium text-xs ml-2 flex-shrink-0"
          >
            Settings
          </button>
        </div>
      </div>

      <GatewaySetupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfigured={(newUrl) => {
          setCurrentGatewayUrl(newUrl || null);
          setError('');
        }}
      />
    </div>
  );
}
