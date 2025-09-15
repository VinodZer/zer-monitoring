import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import GlobalErrorGuard from '@/components/global-error-guard'

export const metadata: Metadata = {
  title: 'Market Ticks Monitor - Real-Time Trading Dashboard',
  description: 'Professional real-time market data monitoring with inactivity alerts',
  generator: 'v0.dev',
}

/**
 * RootLayout sets up the global HTML structure for the app and wraps content
 * with the ThemeProvider. This file is used by Next's App Router as the root
 * layout for all pages.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <body className="font-sans bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Global client-side guard to suppress noisy third-party errors (e.g., FullStory) */}
          <GlobalErrorGuard />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
