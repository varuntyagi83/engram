import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Memory Engine',
  description: 'Local-first persistent memory for AI agents',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0f0f0f', color: '#e5e5e5' }}>
        {children}
      </body>
    </html>
  )
}
