'use client';
import Link from 'next/link';
import { useState } from 'react';
import { getErrorMessage } from '../../utils/errors';
import { getAuthClient } from '../../utils/gateway';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);

    try {
      const client = getAuthClient();
      await client.forgotPassword({ email });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg.includes('network failure')) {
        setError(msg);
      } else {
        // Ignore other errors to prevent enumeration
        setSubmitted(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm text-center">
          <h2 className="text-2xl font-bold">Check Your Email</h2>
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, we have sent a password reset link.
          </p>
          <Link href="/login" className="text-blue-500 text-sm">
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-2xl font-bold">Forgot Password</h2>
        <p className="text-muted-foreground text-sm">Enter your email to receive a reset link.</p>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="text-sm text-center">
          <Link href="/login" className="text-blue-500">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
