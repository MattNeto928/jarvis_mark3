import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import './globals.css'

const roboto = Roboto({ 
  weight: ['100', '300', '400', '500'],
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Smart Mirror | AI Assistant',
  description: 'Intelligent mirror with voice assistant and real-time information',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={roboto.className}>{children}</body>
    </html>
  )
}

