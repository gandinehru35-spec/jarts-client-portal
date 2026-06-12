'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'

export default function SignupPage() {
  const supabase = createClient()
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        email,
      })
    }

    setMessage('Signup successful. Check your email if confirmation is enabled.')
    setLoading(false)
    router.push('/portal')
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <form onSubmit={handleSignup} className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-3xl font-bold">Create account</h1>
        <input
          className="w-full rounded-lg bg-white/10 p-3"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <input
          className="w-full rounded-lg bg-white/10 p-3"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded-lg bg-white/10 p-3"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="w-full rounded-lg bg-red-600 p-3 font-semibold"
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create account'}
        </button>
        {message && <p className="text-sm text-zinc-300">{message}</p>}
      </form>
    </main>
  )
}