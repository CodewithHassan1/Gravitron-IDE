"use client"
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPromiseClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { AuthService } from '@ag/proto/gen/ts/auth/v1/auth_connect'

const transport = createConnectTransport({ baseUrl: 'http://localhost:8080' })
const client = createPromiseClient(AuthService, transport)

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await client.register({ email, password, displayName })
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm text-center">
          <h2 className="text-2xl font-bold">Registration Successful</h2>
          <p className="text-sm text-muted-foreground">Please check your email for a verification link.</p>
          <Link href="/login" className="text-blue-500 text-sm">Return to Login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-2xl font-bold">Create Account</h2>
        <p className="text-muted-foreground text-sm">Sign up to get started.</p>
        
        {error && <div className="text-red-500 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input type="text" placeholder="Display Name (optional)" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required />
            <input type="password" placeholder="Password (min 8 characters)" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required minLength={8} />
          </div>
          <button type="submit" className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground">
            Register
          </button>
        </form>

        <div className="text-sm text-center">
          Already have an account? <Link href="/login" className="text-blue-500">Sign In</Link>
        </div>
      </div>
    </div>
  )
}
