"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TransportProvider } from "@connectrpc/connect-query"
import { ThemeProvider } from "next-themes"
import { useState } from "react"
import { AppBootstrapProvider } from "./AppBootstrapProvider"
import { dynamicTransport } from "../utils/gateway"

console.log("[BOOT TRACE] providers loaded");

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <TransportProvider transport={dynamicTransport}>
        <QueryClientProvider client={queryClient}>
          <AppBootstrapProvider>
            {children}
          </AppBootstrapProvider>
        </QueryClientProvider>
      </TransportProvider>
    </ThemeProvider>
  )
}
