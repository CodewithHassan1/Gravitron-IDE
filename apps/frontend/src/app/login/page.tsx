"use client"
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../stores/auth'
import { createPromiseClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { AuthService } from '@ag/proto/gen/ts/auth/v1/auth_connect'

const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8080' // Gateway URL
})
const client = createPromiseClient(AuthService, transport)

export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore(state => state.login)
  const setStatus = useAuthStore(state => state.setStatus)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setStatus('AUTHENTICATING')

    try {
      const res = await client.passwordLogin({ email, password })
      
      if (res.status === 'PENDING_VERIFICATION') {
        login(res.accessToken, { email }, 'PENDING_VERIFICATION')
        router.push('/verify-email')
      } else {
        login(res.accessToken, { email }, 'AUTHENTICATED')
        router.push('/dashboard')
      }
    } catch (err: any) {
      setStatus('UNAUTHENTICATED')
      setError(err.message || 'Invalid email or password')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-2xl font-bold">Sign In</h2>
        <p className="text-muted-foreground text-sm">Sign in to access your workspaces.</p>
        
        {error && <div className="text-red-500 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input 
              type="email" 
              placeholder="Email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
              required
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
              required
            />
          </div>
          <button type="submit" className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground">
            Sign In
          </button>
        </form>

        <div className="text-sm text-center">
          Don&apos;t have an account? <Link href="/register" className="text-blue-500">Register</Link>
        </div>
        <div className="text-sm text-center">
          <Link href="/forgot-password" className="text-blue-500">Forgot Password?</Link>
        </div>
      </div>
    </div>
  )
}
