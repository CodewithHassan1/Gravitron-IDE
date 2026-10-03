import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-background text-foreground">
      <h1 className="text-5xl font-bold tracking-tight mb-4">Gravitron IDE</h1>
      <p className="text-xl text-muted-foreground mb-8">Enterprise production environment.</p>

      <div className="flex gap-4">
        <Link href="/login" className="px-6 py-3 bg-primary text-primary-foreground font-medium rounded-md hover:opacity-90 transition-opacity">
          Login
        </Link>
        <Link href="/dashboard" className="px-6 py-3 bg-secondary text-secondary-foreground font-medium rounded-md hover:opacity-90 transition-opacity">
          Dashboard
        </Link>
      </div>
    </div>
  )
}
