import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import { Providers } from '@/providers'
import { AppShell } from '@/components/layout/AppShell';

if (typeof window !== 'undefined') {
  console.log("[BOOT TRACE] layout loaded");
}

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gravitron IDE',
  description: 'Enterprise production environment',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <AppShell>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  )
}
