import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { createAdminClient } from '../../lib/supabase/admin'

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
    .maybeSingle()

  // KEY FIX: query by profile_id (auth UID) — not user_id
  // Also pull booking_requests so pending bookings show up before Cal confirms them
  const { data: bookingRequests } = await supabase
    .from('booking_requests')
    .select(`
      *,
      booking_line_items (
        service_name,
        unit_price,
        quantity,
        line_total
      )
    `)
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })

  const statusColor: Record<string, string> = {
    pending_cal_confirmation: 'text-yellow-400',
    confirmed: 'text-green-400',
    cancelled: 'text-red-400',
    completed: 'text-blue-400',
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-6xl space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Client Portal</h1>
            <p className="mt-2 text-zinc-400">
              Welcome back, {profile?.full_name || user.email}
            </p>
          </div>
          <Link href="/portal/bookings/new" className="rounded-lg bg-red-600 px-5 py-3 font-semibold hover:bg-red-500 transition-colors">
            New Booking
          </Link>
        </div>

        {/* Stats */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-zinc-400">Booking Requests</p>
            <h2 className="mt-2 text-3xl font-bold">{bookingRequests?.length ?? 0}</h2>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-zinc-400">Orders</p>
            <h2 className="mt-2 text-3xl font-bold">{orders?.length ?? 0}</h2>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-zinc-400">Email</p>
            <h2 className="mt-1 text-sm font-medium text-zinc-300 break-all">{user.email}</h2>
          </div>
        </section>

        {/* Booking Requests */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-2xl font-bold">Your Bookings</h2>
          <div className="space-y-4">
            {bookingRequests?.map((req: any) => (
              <div key={req.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold text-lg">{req.package_summary || 'Booking Request'}</p>
                    <p className="text-xs text-zinc-500 mt-1">Ref: {req.reference}</p>
                    {req.property_address && (
                      <p className="text-sm text-zinc-400 mt-1">📍 {req.property_address}</p>
                    )}
                    {req.scheduled_start && (
                      <p className="text-sm text-zinc-400 mt-1">
                        📅 {new Date(req.scheduled_start).toLocaleString('en-CA', {
                          dateStyle: 'medium', timeStyle: 'short'
                        })}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-semibold capitalize ${statusColor[req.status] || 'text-zinc-400'}`}>
                      {req.status?.replace(/_/g, ' ')}
                    </span>
                    <p className="text-white font-bold text-lg mt-1">
                      ${Number(req.display_total || 0).toFixed(2)} <span className="text-xs text-zinc-500">+ HST</span>
                    </p>
                  </div>
                </div>

                {/* Line items */}
                {req.booking_line_items?.length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-3 space-y-1">
                    {req.booking_line_items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm text-zinc-400">
                        <span>{item.service_name}</span>
                        <span>${Number(item.unit_price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {req.notes && (
                  <p className="mt-3 text-xs text-zinc-500 border-t border-white/10 pt-2">
                    Notes: {req.notes}
                  </p>
                )}
              </div>
            ))}
            {!bookingRequests?.length && (
              <p className="text-zinc-400">No bookings yet. <Link href="/#services" className="text-red-400 underline">Browse services →</Link></p>
            )}
          </div>
        </section>

        {/* Orders */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-2xl font-bold">Order History</h2>
          <div className="space-y-3">
            {orders?.map((order: any) => (
              <div key={order.id} className="rounded-xl border border-white/10 p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-semibold">{order.description || order.package_name || 'Order'}</p>
                  <p className="text-sm text-zinc-400 mt-1">
                    Status: <span className="capitalize">{order.status}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">${Number(order.amount || 0).toFixed(2)} {order.currency || 'CAD'}</p>
                  {order.stripe_payment_link && (
                    <a href={order.stripe_payment_link} className="mt-1 inline-block text-sm text-red-400 hover:text-red-300" target="_blank" rel="noreferrer">
                      Pay now →
                    </a>
                  )}
                </div>
              </div>
            ))}
            {!orders?.length && <p className="text-zinc-400">No orders yet.</p>}
          </div>
        </section>

        {/* Sign out */}
        <div className="text-center">
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Sign out
            </button>
          </form>
        </div>

      </div>
    </main>
  )
}
