'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      setIsError(true)
      setMessage('Missing Supabase environment variables.')
      return
    }

    setLoading(true)
    setMessage('')
    setIsError(false)

    const { createClient } = await import('../../lib/supabase/client')
    const supabase = createClient()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (error) {
      setIsError(true)
      // KEY FIX: if user already exists (booked via marketing site), tell them to log in
      if (error.message?.toLowerCase().includes('already registered') || error.message?.toLowerCase().includes('already been registered')) {
        setMessage('An account with this email already exists. Please log in instead — your bookings are waiting for you.')
      } else {
        setMessage(error.message)
      }
      setLoading(false)
      return
    }

    if (data.user) {
      // Upsert profile — links to any existing booking data created from the marketing site
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        email: email.toLowerCase(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
    }

    setMessage('Account created! Redirecting to your portal...')
    setLoading(false)
    setTimeout(() => router.push('/portal'), 800)
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <form onSubmit={handleSignup} className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-white/5 p-8">
        <div>
          <h1 className="text-3xl font-bold">Create account</h1>
          <p className="mt-1 text-sm text-zinc-400">Already have a booking? Use the same email to see it here.</p>
        </div>
        <input
          className="w-full rounded-lg bg-white/10 p-3 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg bg-white/10 p-3 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg bg-white/10 p-3 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="Password (min 6 characters)"
          type="password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          className="w-full rounded-lg bg-red-600 p-3 font-semibold hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
        {message && (
          <p className={`text-sm ${isError ? 'text-red-400' : 'text-green-400'}`}>{message}</p>
        )}
        <p className="text-center text-sm text-zinc-400">
          Already have an account?{' '}
          <Link href="/login" className="text-red-400 hover:text-red-300">Log in</Link>
        </p>
      </form>
    </main>
  )
}
