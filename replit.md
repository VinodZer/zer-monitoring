# Market Ticks Monitor - Real-Time Trading Dashboard

## Overview

Market Ticks Monitor is a professional real-time market data monitoring application built with Next.js 14 (App Router). The application connects to a live market data feed via Server-Sent Events (SSE) to display real-time tick data for various financial instruments including equities, indices, currencies, and commodities. It provides comprehensive monitoring capabilities with inactivity alerts, market timing awareness, and sophisticated data visualization.

The dashboard is designed for traders and analysts who need to monitor live market feeds with advanced alerting capabilities when data becomes stale or instruments stop updating during market hours.

## User Preferences

Preferred communication style: Simple, everyday language.

## Replit Environment Configuration

**Date migrated**: October 16, 2025

**Package Manager**: pnpm 10.17.1

**Development Configuration**:
- Dev server runs on port 5000 (0.0.0.0:5000) as required by Replit
- Workflow configured: "Next.js Dev Server" runs `pnpm run dev`
- Production deployment uses `autoscale` mode with `pnpm run build` and `pnpm run start`

**Migration Changes**:
- Updated `package.json` scripts to bind to 0.0.0.0:5000 for Replit compatibility
- Removed Vercel-specific `allowedDevOrigins` from `next.config.mjs`
- Configured deployment settings for Replit's autoscale deployment target

**No Environment Variables Required**: This application uses a public SSE feed and has no API keys or secrets.

## System Architecture

### Frontend Architecture

**Framework**: Next.js 14 with App Router (React Server Components + Client Components)
- Server-side rendering for initial page load and SEO optimization
- Client-side components for real-time interactivity and state management
- TypeScript for type safety across the codebase

**UI Framework**: Shadcn/ui + Radix UI primitives
- Component-based architecture with reusable UI primitives
- Tailwind CSS for styling with custom theming support
- Dark mode support via next-themes
- Responsive design with custom breakpoints (mobile-first approach)

**State Management**: React hooks with local component state
- Custom hooks for data fetching and business logic (`use-tick-data`, `use-inactivity-alerts`)
- No global state management library (Redux/Zustand) - component-level state with prop drilling
- Real-time data updates via EventSource API in custom hooks

### Core Features & Components

**Real-Time Data Feed (`hooks/use-tick-data.ts`)**
- Connects to SSE endpoint at `https://ticks.rvinod.com/ticks`
- Processes incoming tick data with depth information (market depth, bid/ask spreads)
- Tracks connection status, freeze detection, and latency metrics
- Implements automatic reconnection logic with exponential backoff
- Stores limited tick history (MAX_TICKS_STORED: 200) for performance
- Computes derived metrics: average delay, freezing incidents, inter-tick delays

**Inactivity Alert System (`hooks/use-inactivity-alerts.ts`)**
- Monitors individual instruments for data staleness
- Configurable thresholds per instrument (LTP-only and Depth+LTP composite alerts)
- Market hours awareness - respects trading sessions for different asset classes
- Uses StaleDataDetector utility for deterministic staleness detection
- Generates alerts with severity levels (high/medium/low) based on duration and price volatility

**Market Timing Logic (`utils/market-timings.ts`)**
- Defines trading hours for equity, currency, commodity, G-Sec, and bond markets
- Supports pre-market, normal, and post-market sessions
- Holiday calendar integration (2024 Indian market holidays)
- Used to suppress alerts outside market hours when configured

**Data Processing Utilities**
- `depth-ltp.ts`: Computes composite price from market depth (average of bid/ask/LTP)
- `price-trends.ts`: Calculates price changes and trend directions
- `candlestick-data.ts`: Generates OHLC candles from tick data
- `stale-data-detector.ts`: Deterministic hash-based staleness detection with configurable thresholds

**Visualization Components**
- `MarketDataGrid`: Main grid displaying all active instruments with real-time updates
- `MiniPriceChart`/`MiniDepthLtpSparkline`: SVG-based compact charts for price movement
- `InactivityAlertsLog`: Filterable log of all inactivity alerts with sorting/search
- `AlertSettingsTab`: Per-instrument alert configuration panel
- `DebugDashboard`: Developer tools for feed monitoring and endpoint testing

**Security**
- `PasskeyGuard`: Client-side password protection (hardcoded: "Zerodha@123")
- `DashboardGuard`: Blur overlay until passkey is entered (no session persistence by design)
- `GlobalErrorGuard`: Suppresses third-party errors (e.g., FullStory) from breaking the UI

### Data Flow

1. **Connection Establishment**: `use-tick-data` hook establishes SSE connection on mount
2. **Message Processing**: Raw SSE messages parsed as JSON, validated, and stored with timestamps
3. **Tick Storage**: New ticks added to state, old ticks removed (FIFO, max 200 ticks)
4. **Alert Detection**: `use-inactivity-alerts` monitors tick freshness per instrument, fires alerts when thresholds exceeded
5. **UI Updates**: Components re-render on state changes, charts recalculate from tick history
6. **Freeze Detection**: System monitors global feed staleness (5s threshold), displays connection status

### Performance Optimizations

- Memoization with `useMemo` for expensive computations (chart data, filtered lists)
- `React.memo` for components that re-render frequently (SymbolCard, table rows)
- Limited history retention to prevent memory bloat
- Debounced state updates in some components
- SVG-based charts for lightweight rendering

### Styling Approach

- Tailwind CSS with custom configuration (`tailwind.config.ts`)
- CSS custom properties for theming (light/dark mode variables)
- Custom breakpoints optimized for trading dashboards (sm: 1000px, md: 1200px, etc.)
- Neutral color scheme as base with chart-specific colors
- Responsive design with mobile-specific layouts

### File Structure Pattern

- `app/`: Next.js App Router pages and layouts
- `components/`: Reusable React components (business logic + UI primitives)
- `components/ui/`: Shadcn/ui primitive components (buttons, cards, dialogs, etc.)
- `hooks/`: Custom React hooks for data and logic
- `utils/`: Pure utility functions (calculations, formatters, helpers)
- `lib/`: Shared libraries and helper modules

## External Dependencies

### Third-Party Services

**Market Data Feed**: SSE endpoint at `https://ticks.rvinod.com/ticks`
- Provides real-time tick data in JSON format
- Includes instrument tokens, prices, volumes, market depth
- No authentication required (public feed)
- Auto-reconnects on connection loss

### NPM Packages

**Core Framework**
- `next` 14.2.16: React framework with App Router
- `react` & `react-dom`: UI library (version managed by Next.js)
- `typescript`: Type checking and development

**UI Components**
- `@radix-ui/*`: Unstyled accessible UI primitives (dialog, dropdown, select, etc.)
- `tailwindcss`: Utility-first CSS framework
- `class-variance-authority`: Component variant styling
- `lucide-react`: Icon library

**Form Management**
- `react-hook-form`: Form state management
- `@hookform/resolvers`: Form validation resolvers
- `zod`: Schema validation (implied by resolvers)

**Charts & Visualization**
- `recharts`: Chart library for performance metrics
- `embla-carousel-react`: Carousel component
- Custom SVG-based mini charts (no external library)

**Theming**
- `next-themes`: Dark mode support
- CSS variables for dynamic theming

**Utilities**
- `clsx` & `tailwind-merge`: Conditional class name utilities
- `date-fns`: Date formatting and manipulation
- `cmdk`: Command palette component
- `vaul`: Drawer component

**Analytics**
- `@vercel/analytics`: Vercel Analytics integration

### Build Tools

- `autoprefixer`: CSS vendor prefixing
- TypeScript compiler (via Next.js)
- Next.js built-in bundler (Turbopack/Webpack)

### API Integration Points

**SSE Endpoint**: `https://ticks.rvinod.com/ticks`
- Purpose: Real-time market data stream
- Protocol: Server-Sent Events (text/event-stream)
- Data format: JSON objects with tick data
- Reconnection: Automatic with exponential backoff
- Error handling: Connection status tracking, retry mechanism

**No Database**: Application is stateless, all data is ephemeral and exists only in client memory during the session.