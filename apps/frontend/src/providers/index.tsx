"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TransportProvider } from "@connectrpc/connect-query"
import { createConnectTransport } from "@connectrpc/connect-web"
import { ThemeProvider } from "next-themes"
import { useState } from "react"
import { AppBootstrapProvider } from "./AppBootstrapProvider"

console.log("[BOOT TRACE] providers loaded");

const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8080",
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          <AppBootstrapProvider>
            {children}
          </AppBootstrapProvider>
        </QueryClientProvider>
      </TransportProvider>
    </ThemeProvider>
  )
}
