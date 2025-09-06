import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Office Management System-P.City Tech',
  description: 'Fully Managed Office Management System of P.City Tech',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}