'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewBookingPage() {
  const router = useRouter()
  const [serviceType, setServiceType] = useState('')
  const [requestedDate, setRequestedDate] = useState('')
  const [requestedTime, setRequestedTime] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { createClient } = await import('../../../../lib/supabase/client')
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setMessage('Please log in first.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('bookings').insert({
      user_id: user.id,
      service_type: serviceType,
      requested_date: requestedDate,
      requested_time: requestedTime,
      status: 'requested',
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage('Booking submitted!')
    setLoading(false)
    setTimeout(() => router.push('/portal'), 1500)
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8">
        <h1 className="mb-6 text-3xl font-bold">Request a Booking</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input className="w-full rounded-lg bg-white/10 p-3" placeholder="Service type (e.g. Photo shoot)" value={serviceType} onChange={(e) => setServiceType(e.target.value)} required />
          <input className="w-full rounded-lg bg-white/10 p-3" type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} required />
          <input className="w-full rounded-lg bg-white/10 p-3" placeholder="Preferred time (e.g. 2 pm)" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} />
          <button className="w-full rounded-lg bg-red-600 px-5 py-3 font-semibold disabled:opacity-50" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit booking'}
          </button>
        </form>
        {message && <p className="mt-4 text-zinc-300">{message}</p>}
      </div>
    </main>
  )
}
