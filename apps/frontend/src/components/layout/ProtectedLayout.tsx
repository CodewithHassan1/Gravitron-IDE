'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/auth';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (status === 'UNAUTHENTICATED' || status === 'SESSION_EXPIRED') {
      router.push('/login');
    } else if (status === 'PENDING_VERIFICATION') {
      router.push('/verify-email');
    }
  }, [status, router]);

  if (status !== 'AUTHENTICATED') {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        Loading secure context...
      </div>
    );
  }

  return <>{children}</>;
}
