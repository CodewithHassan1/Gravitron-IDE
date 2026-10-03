'use client';

import dynamic from 'next/dynamic';
import React from 'react';

const AppShell = dynamic(() => import('@/components/layout/AppShell').then((mod) => mod.AppShell), {
  ssr: false,
});

export function ClientShell({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
