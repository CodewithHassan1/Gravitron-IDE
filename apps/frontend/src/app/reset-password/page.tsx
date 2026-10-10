"use client"
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createPromiseClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { AuthService } from '@ag/proto/gen/ts/auth/v1/auth_connect'

const transport = createConnectTransport({ baseUrl: process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8080' })
const client = createPromiseClient(AuthService, transport)

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!token) {
      setError('Missing reset token.')
      return
    }

    try {
      await client.resetPassword({ token, newPassword: password })
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Reset failed')
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm text-center">
          <h2 className="text-2xl font-bold">Password Reset Successful</h2>
          <p className="text-sm text-muted-foreground">Your password has been updated. You can now log in.</p>
          <Link href="/login" className="text-blue-500 text-sm">Return to Login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-2xl font-bold">Reset Password</h2>
        <p className="text-muted-foreground text-sm">Enter your new password below.</p>
        
        {error && <div className="text-red-500 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" placeholder="New Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required minLength={8} />
          <button type="submit" className="flex w-full items-center justify-center rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground">
            Update Password
          </button>
        </form>
      </div>
    </div>
  )
}
