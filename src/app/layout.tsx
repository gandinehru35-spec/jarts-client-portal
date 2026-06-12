import './globals.css'
import type { ReactNode } from 'react'

export const metadata = {
  title: 'J Arts Client Portal',
  description: 'Client portal for J Arts 360 View',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
