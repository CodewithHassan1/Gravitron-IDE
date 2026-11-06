'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '../../stores/auth';
import { getErrorMessage } from '../../utils/errors';
import { getAuthClient } from '../../utils/gateway';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const logout = useAuthStore((state) => state.logout);

  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isVerifying, setIsVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const verifyAttempted = useRef(false);

  const token = searchParams.get('token');

  useEffect(() => {
    if (token && !verifyAttempted.current) {
      verifyAttempted.current = true;
      setIsVerifying(true);
      setVerificationError('');
      getAuthClient()
        .verifyEmail({ token })
        .then(() => {
          setVerifySuccess(true);
        })
        .catch((err) => {
          setVerificationError(getErrorMessage(err));
        })
        .finally(() => {
          setIsVerifying(false);
        });
    }
  }, [token]);

  const handleResend = async () => {
    if (isSubmitting) return;
    setResendError('');
    setResendMessage('');
    setIsSubmitting(true);

    try {
      const accessToken = useAuthStore.getState().accessToken;
      await getAuthClient().resendVerification(
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      setResendMessage('Verification email resent successfully.');
    } catch (err: unknown) {
      setResendError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (isVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm text-center">
          <h2 className="text-2xl font-bold">Verifying Email...</h2>
          <p className="text-sm text-muted-foreground">Please wait while we verify your account.</p>
        </div>
      </div>
    );
  }

  if (verifySuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm text-center">
          <h2 className="text-2xl font-bold text-green-600">Email Verified Successfully</h2>
          <p className="text-sm text-muted-foreground">Your account is now active.</p>
          <div className="pt-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground"
            >
              Continue to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (token && verificationError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm text-center">
          <h2 className="text-2xl font-bold text-destructive">Verification Failed</h2>
          <p className="text-sm text-muted-foreground">{verificationError}</p>
          <div className="pt-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm text-center">
        <h2 className="text-2xl font-bold">Verify Your Email</h2>
        <p className="text-muted-foreground text-sm">
          Please check your inbox and click the verification link to activate your account.
        </p>

        {resendError && <div className="text-red-500 text-sm">{resendError}</div>}
        {resendMessage && <div className="text-green-500 text-sm">{resendMessage}</div>}

        <div className="space-y-2 pt-4">
          <button
            onClick={handleResend}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? 'Sending...' : 'Resend Verification Email'}
          </button>

          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center rounded-md border border-input bg-background py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm text-center">
            <h2 className="text-2xl font-bold">Loading...</h2>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
