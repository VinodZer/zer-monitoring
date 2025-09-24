import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import GlobalErrorGuard from '@/components/global-error-guard'

export const metadata: Metadata = {
  title: 'Market Ticks Monitor - Real-Time Trading Dashboard',
  description: 'Professional real-time market data monitoring with inactivity alerts',
  generator: 'v0.dev',
  icons: {
    icon: [
      { url: 'https://cdn.builder.io/api/v1/image/assets%2F212686917e6a43feac2002a1e679ce72%2F4232d9a3a4bc400a91ef28288c1e35f6?format=webp&width=800' },
    ],
  },
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
