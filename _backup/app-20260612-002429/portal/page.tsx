import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'

export default async function PortalPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="text-4xl font-bold">Client Portal</h1>
          <p className="text-zinc-400 mt-2">
            Welcome {profile?.full_name || user.email}
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-zinc-400">Bookings</p>
            <h2 className="mt-2 text-3xl font-bold">{bookings?.length ?? 0}</h2>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-zinc-400">Orders</p>
            <h2 className="mt-2 text-3xl font-bold">{orders?.length ?? 0}</h2>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-zinc-400">Account</p>
            <h2 className="mt-2 text-lg font-semibold">Active</h2>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-bold mb-4">Recent bookings</h2>
          <div className="space-y-3">
            {bookings?.map((booking) => (
              <div key={booking.id} className="rounded-xl border border-white/10 p-4">
                <p className="font-semibold">{booking.service_type}</p>
                <p className="text-sm text-zinc-400">Status: {booking.status}</p>
                <p className="text-sm text-zinc-400">
                  Requested: {booking.requested_date || 'Not set'}
                </p>
              </div>
            ))}
            {!bookings?.length && <p className="text-zinc-400">No bookings yet.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-bold mb-4">Order history</h2>
          <div className="space-y-3">
            {orders?.map((order) => (
              <div key={order.id} className="rounded-xl border border-white/10 p-4">
                <p className="font-semibold">{order.package_name || 'Order'}</p>
                <p className="text-sm text-zinc-400">Status: {order.order_status}</p>
                <p className="text-sm text-zinc-400">Payment: {order.payment_status}</p>
                {order.stripe_payment_link && (
                  <a
                    href={order.stripe_payment_link}
                    className="mt-2 inline-block text-red-400"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Pay now
                  </a>
                )}
              </div>
            ))}
            {!orders?.length && <p className="text-zinc-400">No orders yet.</p>}
          </div>
        </section>
      </div>
    </main>
  )
}