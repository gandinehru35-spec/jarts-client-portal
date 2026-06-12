import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
        <h1 className="text-4xl font-bold">J Arts Client Portal</h1>
        <p className="mt-4 text-zinc-400">
          Manage your bookings, orders, and account in one place.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/signup" className="rounded-lg bg-red-600 px-5 py-3 font-semibold">
            Create account
          </Link>
          <Link href="/login" className="rounded-lg border border-white/10 px-5 py-3 font-semibold">
            Log in
          </Link>
        </div>
      </div>
    </main>
  )
}
