import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cuộc Chiến Giá Cả',
  description: 'Trò chơi mô phỏng kinh tế nhiều người chơi',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  )
}
