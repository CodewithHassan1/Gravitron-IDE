'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Settings2, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { getErrorMessage } from '../../utils/errors';
import { getGatewayUrl, getAuthClient, isProductionRuntime } from '../../utils/gateway';
import { GatewaySetupModal } from './GatewaySetupModal';
import { GravitronAuthVisual } from './GravitronAuthVisual';

export type AuthMode = 'signin' | 'signup';

interface DiagonalAuthExperienceProps {
  initialMode: AuthMode;
}

const TRANSITION_EASE = [0.22, 1, 0.36, 1] as const;

export function DiagonalAuthExperience({ initialMode }: DiagonalAuthExperienceProps) {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const setStatus = useAuthStore((state) => state.setStatus);

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [emailFailed, setEmailFailed] = useState(false);
  const [justVerified, setJustVerified] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentGatewayUrl, setCurrentGatewayUrl] = useState<string | null>(null);

  useEffect(() => {
    setCurrentGatewayUrl(getGatewayUrl());
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('verified') === 'true') {
        setJustVerified(true);
      }
    }
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode || isSubmitting) return;
    setError('');
    setFieldErrors({});
    setSignupSuccess(false);
    setEmailFailed(false);
    setMode(nextMode);
    if (typeof window !== 'undefined') {
      const isElectronFile = window.location.protocol === 'app:';
      const targetUrl = isElectronFile
        ? nextMode === 'signin'
          ? '/login.html'
          : '/register.html'
        : nextMode === 'signin'
          ? '/login'
          : '/register';
      window.history.replaceState(null, '', targetUrl);
    }
  };

  const validateSignIn = (): boolean => {
    const errs: Record<string, string> = {};
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      errs.email = 'Please enter a valid email address.';
    }
    if (!password) {
      errs.password = 'Password is required.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateSignUp = (): boolean => {
    const errs: Record<string, string> = {};
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      errs.email = 'Please enter a valid email address.';
    }
    if (!password || password.length < 8) {
      errs.password = 'Password must be at least 8 characters long.';
    }
    if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    if (!validateSignIn()) return;

    setStatus('AUTHENTICATING');
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const client = getAuthClient();
      const res = await client.passwordLogin({ email: normalizedEmail, password });

      if (res.status === 'PENDING_VERIFICATION') {
        login(
          res.accessToken,
          { email: normalizedEmail },
          'PENDING_VERIFICATION',
          res.refreshToken
        );
        router.push('/verify-email');
      } else {
        login(res.accessToken, { email: normalizedEmail }, 'AUTHENTICATED', res.refreshToken);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setStatus('UNAUTHENTICATED');
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setEmailFailed(false);
    if (!validateSignUp()) return;

    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const client = getAuthClient();
      const res = await client.register({
        email: normalizedEmail,
        password,
        displayName: displayName.trim(),
      });
      if (res.status === 'PENDING_VERIFICATION_EMAIL_FAILED') {
        setEmailFailed(true);
      }
      setSignupSuccess(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderFormContent = () => {
    if (mode === 'signup' && signupSuccess) {
      return (
        <div className="space-y-5">
          <div className="inline-flex items-center space-x-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{emailFailed ? 'Account Created' : 'Verification Sent'}</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {emailFailed ? 'Account Created' : 'Check Your Inbox'}
          </h1>
          {emailFailed ? (
            <p className="text-sm text-amber-400 leading-relaxed">
              Your account was created, but we could not deliver the verification email
              automatically. Switch to Sign In and click &ldquo;Resend Verification Email&rdquo;.
            </p>
          ) : (
            <p className="text-sm text-zinc-400 leading-relaxed">
              We sent a verification link to <span className="text-zinc-200 font-medium">{email}</span>.
              Verify your email to activate your Gravitron IDE workspace.
            </p>
          )}
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="w-full inline-flex items-center justify-center space-x-2 rounded-lg bg-[#0055ff] hover:bg-[#1967ff] text-white py-2.5 text-sm font-medium transition-colors"
          >
            <span>Continue to Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      );
    }

    const isSignIn = mode === 'signin';

    return (
      <div className="space-y-4 w-full">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="bg-white/95 px-2.5 py-1 rounded-lg shadow-sm lg:hidden">
              <img
                src="/brand/gravitron-logo.png"
                alt="Gravitron IDE"
                className="h-5 w-auto object-contain"
              />
            </div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#00f0ff]">
              {isSignIn ? 'Sign In' : 'Create Account'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isSignIn ? 'Welcome back' : 'Start building with Gravitron'}
          </h1>
          <p className="text-xs text-zinc-400">
            {isSignIn
              ? 'Sign in to access your cloud and local workspaces.'
              : 'Create your Gravitron account to initialize your workspace.'}
          </p>
        </div>

        {!currentGatewayUrl && isProductionRuntime() && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-400 space-y-2">
            <div className="font-semibold">Gateway Not Configured</div>
            <p className="text-amber-300/90">
              Configure your production Gateway URL before authenticating.
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="rounded bg-amber-500 text-black px-2.5 py-1 font-medium hover:bg-amber-400 transition-colors"
            >
              Configure Gateway
            </button>
          </div>
        )}

        {isSignIn && justVerified && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 text-xs text-emerald-400 space-y-1">
            <p className="font-semibold">Email Verified Successfully</p>
            <p>Your account is active. Sign in to launch your workspace.</p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400 flex items-start space-x-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{error}</p>
              {error.includes('Gateway URL is not configured') && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="text-xs font-semibold text-[#00f0ff] underline"
                >
                  Configure Server Endpoint
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={isSignIn ? handleSignInSubmit : handleSignUpSubmit} className="space-y-3" noValidate>
          {!isSignIn && (
            <div className="space-y-1">
              <label htmlFor="auth-display-name" className="block text-xs font-medium text-zinc-300">
                Display Name <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="auth-display-name"
                type="text"
                autoComplete="name"
                placeholder="Alex Rivera"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0b0d18] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#00f0ff]/50 focus:border-[#00f0ff]/60 transition"
              />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-300">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
              }}
              aria-invalid={Boolean(fieldErrors.email)}
              className="w-full rounded-lg border border-white/10 bg-[#0b0d18] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#00f0ff]/50 focus:border-[#00f0ff]/60 transition"
              required
            />
            {fieldErrors.email && <p className="text-[11px] text-red-400">{fieldErrors.email}</p>}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="auth-password" className="block text-xs font-medium text-zinc-300">
                Password
              </label>
              {isSignIn && (
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-[#00f0ff] hover:underline focus:outline-none focus:underline"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                placeholder={isSignIn ? 'Enter your password' : 'Minimum 8 characters'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
                }}
                aria-invalid={Boolean(fieldErrors.password)}
                className="w-full rounded-lg border border-white/10 bg-[#0b0d18] pl-3 pr-9 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#00f0ff]/50 focus:border-[#00f0ff]/60 transition"
                required
                minLength={isSignIn ? undefined : 8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldErrors.password && <p className="text-[11px] text-red-400">{fieldErrors.password}</p>}
          </div>

          {!isSignIn && (
            <div className="space-y-1">
              <label htmlFor="auth-confirm-password" className="block text-xs font-medium text-zinc-300">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="auth-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword) {
                      setFieldErrors((p) => ({ ...p, confirmPassword: '' }));
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  className="w-full rounded-lg border border-white/10 bg-[#0b0d18] pl-3 pr-9 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#00f0ff]/50 focus:border-[#00f0ff]/60 transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="text-[11px] text-red-400">{fieldErrors.confirmPassword}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center space-x-2 rounded-lg bg-gradient-to-r from-[#0055ff] to-[#0088ff] hover:from-[#1967ff] hover:to-[#00a2ff] text-white py-2.5 text-sm font-semibold shadow-lg shadow-[#0055ff]/20 disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-[#00f0ff]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isSignIn ? 'Signing In...' : 'Creating Account...'}</span>
              </>
            ) : (
              <>
                <span>{isSignIn ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-1 text-center text-xs text-zinc-400">
          {isSignIn ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-[#00f0ff] font-medium hover:underline"
              >
                Create Account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-[#00f0ff] font-medium hover:underline"
              >
                Sign In
              </button>
            </>
          )}
        </div>

        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
          <span className="truncate max-w-[220px]" title={currentGatewayUrl || 'Not configured'}>
            Server: <span className="font-mono text-zinc-300">{currentGatewayUrl || 'Not configured'}</span>
          </span>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center space-x-1 text-[#00f0ff] hover:underline font-medium shrink-0 ml-2"
          >
            <Settings2 className="w-3 h-3" />
            <span>Settings</span>
          </button>
        </div>
      </div>
    );
  };

  const isSignIn = mode === 'signin';

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen w-full bg-[#05050a] text-foreground flex items-center justify-center p-3 sm:p-6 overflow-x-hidden">
        {/* Ambient corner accents */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,85,255,0.12),transparent_42%),radial-gradient(circle_at_85%_80%,rgba(0,240,255,0.08),transparent_42%)]"
        />

        {/* DESKTOP DIAGONAL CROSS STAGE (lg+) */}
        <div className="hidden lg:block relative w-full max-w-[1140px] h-[660px] rounded-3xl border border-white/10 bg-[#080a14] shadow-[0_30px_100px_rgba(0,0,0,0.85)] overflow-hidden">
          {/* Subtle X Cross Grid Lines */}
          <svg
            aria-hidden="true"
            viewBox="0 0 1140 660"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 w-full h-full z-20"
          >
            <line
              x1="670"
              y1="0"
              x2="470"
              y2="660"
              stroke={isSignIn ? 'rgba(0,240,255,0.35)' : 'rgba(255,255,255,0.07)'}
              strokeWidth={isSignIn ? '1.5' : '1'}
            />
            <line
              x1="470"
              y1="0"
              x2="670"
              y2="660"
              stroke={!isSignIn ? 'rgba(0,240,255,0.35)' : 'rgba(255,255,255,0.07)'}
              strokeWidth={!isSignIn ? '1.5' : '1'}
            />
            <circle cx="570" cy="330" r="4" fill="#00f0ff" fillOpacity="0.65" />
          </svg>

          {/* Persistent Animated Media Panel — transitions diagonally between Lower-Right (Sign In) and Upper-Left (Sign Up) */}
          <motion.div
            data-testid="auth-media-panel"
            initial={false}
            animate={{
              left: isSignIn ? '41%' : '0%',
              clipPath: isSignIn
                ? 'polygon(22% 0%, 100% 0%, 100% 100%, 0% 100%)'
                : 'polygon(0% 0%, 100% 0%, 78% 100%, 0% 100%)',
            }}
            transition={{ duration: 0.65, ease: TRANSITION_EASE }}
            className="absolute top-0 bottom-0 w-[59%] z-10 overflow-hidden"
          >
            <GravitronAuthVisual mode={mode} align={isSignIn ? 'lower-right' : 'upper-left'} />
          </motion.div>

          {/* Form Region — Upper-Left on Sign In, Lower-Right on Sign Up */}
          <motion.div
            data-testid="auth-form-panel"
            initial={false}
            animate={{
              left: isSignIn ? '0%' : '50%',
            }}
            transition={{ duration: 0.65, ease: TRANSITION_EASE }}
            className="absolute top-0 bottom-0 w-[50%] z-20 flex items-center justify-center p-10"
          >
            <div className="w-full max-w-[360px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{
                    opacity: 0,
                    x: isSignIn ? -28 : 28,
                    y: isSignIn ? -20 : 20,
                  }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{
                    opacity: 0,
                    x: isSignIn ? 28 : -28,
                    y: isSignIn ? 20 : -20,
                  }}
                  transition={{ duration: 0.38, ease: TRANSITION_EASE }}
                >
                  {renderFormContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* TABLET & MOBILE RESPONSIVE STACK (< lg) */}
        <div className="lg:hidden relative w-full max-w-md rounded-2xl border border-white/10 bg-[#080a14] shadow-2xl overflow-hidden flex flex-col">
          <div className="h-44 w-full relative overflow-hidden">
            <GravitronAuthVisual mode={mode} align="upper-left" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-[#080a14]"
              style={{ clipPath: 'polygon(0 100%, 100% 0, 100% 100%)' }}
            />
          </div>
          <div className="p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3, ease: TRANSITION_EASE }}
              >
                {renderFormContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <GatewaySetupModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfigured={(newUrl) => setCurrentGatewayUrl(newUrl || null)}
        />
      </div>
    </MotionConfig>
  );
}
