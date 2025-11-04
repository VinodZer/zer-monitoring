"use client"

import { useMemo, useEffect, useState, memo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  Clock,
  Settings,
  Activity,
  Filter,
  SortAsc,
  SortDesc,
  X,
} from "lucide-react"
import type { TickData } from "@/hooks/use-tick-data"
import { getCurrentMarketStatus, getMarketTypeForInstrument } from "@/utils/market-timings"
import { calculatePriceTrend, calculateDayTrend } from "@/utils/price-trends"
import { calculateDepthAverage } from "@/utils/depth-ltp"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MiniPriceChart } from "./mini-price-chart"
import { SymbolAlertSettingsDialog } from "./symbol-alert-settings-dialog"
import type { InactivityAlertConfig } from "@/hooks/use-inactivity-alerts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert } from "@/components/ui/alert"

// --- Helper functions ---
/**
 * Resolve instrument name from a TickData object. Prefers tradingsymbol if
 * provided, otherwise falls back to a small token-to-name map.
 *
 * @param tick - TickData instance
 * @returns Human readable instrument name
 */
export const getInstrumentName = (tick: TickData) => {
  if (tick.tradingsymbol) return tick.tradingsymbol
  const tokenMap: Record<number, string> = {
    256265: "NIFTY",
    265: "SENSEX",
    260105: "NIFTY BANK",
    26009: "BANKNIFTY",
    12839: "BANKEX",
    128083204: "RELIANCE",
    281836549: "BHEL",
    408065: "USDINR",
    134657: "CRUDEOIL",
    // Add more potential futures tokens
    13979396: "RELIANCE FUT",
    14264834: "SENSEX FUT",
    14318344: "NIFTY FUT",
  }
  return tokenMap[tick.instrument_token] || `TOKEN_${tick.instrument_token}`
}

/**
 * Infer exchange short code for a tick based on its instrument name and market
 * type classification.
 * @param tick - TickData object
 * @returns Exchange code string (e.g., NSE, NFO, BFO, MCX, CDS)
 */
export const getExchange = (tick: TickData) => {
  const name = getInstrumentName(tick).toUpperCase()
  const exch = (tick as any).exchange ? String((tick as any).exchange).toUpperCase() : undefined
  if (exch === "NSE" || exch === "BSE" || exch === "MCX" || exch === "CDS" || exch === "NFO" || exch === "BFO")
    return exch

  const marketType = getMarketTypeForInstrument(name)

  // Market types with unambiguous exchanges
  if (marketType === "currency") return "CDS"
  if (marketType === "commodity") return "MCX"

  // Derivatives detection: FUT, CE, PE or month codes
  const isDerivative =
    name.includes("FUT") || /(?:^|[^A-Z])(CE|PE)(?:$)/.test(name) || /\d{2}[A-Z]{3}(FUT|CE|PE)/.test(name)
  if (isDerivative) {
    // BSE derivatives are typically SENSEX based, otherwise assume NSE F&O
    return name.includes("SENSEX") ? "BFO" : "NFO"
  }

  // Spot indices (no derivatives suffix)
  if (name.includes("SENSEX")) return "BSE"
  if (name.includes("NIFTY")) return "NSE"

  // Explicit hints
  if (name.includes("BSE")) return "BSE"
  if (name.includes("BFO")) return "BFO"
  if (name.includes("NFO")) return "NFO"

  // Default to NSE for cash equities
  return "NSE"
}

/**
 * Format a delay value in milliseconds into a human readable string.
 * @param delay - Delay in milliseconds
 * @returns Formatted string like "200ms", "1.2s", "0.5m" or "N/A"
 */
const formatDelay = (delay: number) => {
  if (delay === 0) return "N/A"
  if (delay < 1000) return `${delay}ms`
  if (delay < 60000) return `${(delay / 1000).toFixed(1)}s`
  return `${(delay / 60000).toFixed(1)}m`
}

/**
 * Format a numeric price value with the appropriate number of decimal places
 * depending on instrument type (currency vs others).
 * @param price - Numeric price value
 * @param instrumentName - Optional instrument name to infer formatting rules
 * @returns Localized formatted price string
 */
const formatPriceWithDecimals = (price: number, instrumentName?: string) => {
  // Guard invalid or missing price
  if (price === null || price === undefined || Number.isNaN(price)) {
    return "-"
  }

  // Currency instruments need 4 decimal places; only check when instrumentName is a string
  const isCurrency =
    typeof instrumentName === "string" &&
    (instrumentName.includes("USDINR") || instrumentName.includes("EURINR") || instrumentName.includes("GBPINR"))

  if (isCurrency) {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(price)
  }

  // All other instruments use 2 decimal places
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

/**
 * Compute the depth average by summing all numeric depth values and dividing by
 * the fixed divisor defined for depth calculations.
 *
 * @param instrument - Partial instrument object containing depth levels
 * @returns Depth average or null when unavailable
 */
function getDepthPlusLtpPrice(instrument?: {
  depth?: {
    buy?: { price?: number; quantity?: number; orders?: number }[]
    sell?: { price?: number; quantity?: number; orders?: number }[]
  }
}) {
  if (!instrument) return null
  return calculateDepthAverage(instrument.depth)
}

interface MarketDataGridProps {
  ticks: TickData[]
  inactiveSymbols: Set<number>
  alertConfigurations: Map<number, InactivityAlertConfig>
  onConfigurationChange: (token: number, config: InactivityAlertConfig) => void
  onMarkAlertAsChecked?: (instrumentToken: number) => void
}

interface InstrumentData extends TickData {
  marketStatus: { isOpen: boolean; session: string; reason: string }
  trend: { change: number; changePercent: number; direction: "up" | "down" | "neutral" }
  dayTrend: { change: number; changePercent: number; direction: "up" | "down" | "neutral" }
}

type SortField = "time" | "price" | "quantity" | "volume" | "change"
type SortDirection = "asc" | "desc"

// Memoized Price animation component
const AnimatedPrice = memo(function AnimatedPrice({
  price,
  previousPrice,
  direction,
}: {
  price: number
  previousPrice: number | null
  direction: "up" | "down" | "neutral"
}) {
  const [animationClass, setAnimationClass] = useState("")
  const [textColorClass, setTextColorClass] = useState("")

  useEffect(() => {
    if (previousPrice !== null && price !== previousPrice) {
      const changeDirection = price > previousPrice ? "up" : "down"
      setAnimationClass(`price-bg-flash-${changeDirection}`)
      setTextColorClass(`price-text-flash-${changeDirection}`)
      const timer = setTimeout(() => {
        setAnimationClass("")
        setTextColorClass("")
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [price, previousPrice])

  const formatPrice = (p: number) =>
    new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p)

  const getBackgroundColor = () => {
    if (animationClass.includes("up")) return "rgba(34, 197, 94, 0.2)"
    if (animationClass.includes("down")) return "rgba(239, 68, 68, 0.2)"
    if (direction === "up") return "rgba(34, 197, 94, 0.1)"
    if (direction === "down") return "rgba(239, 68, 68, 0.1)"
    return "rgba(156, 163, 175, 0.1)"
  }

  return (
    <div
      className={`inline-block px-4 py-2 rounded-lg text-2xl font-bold transition-colors duration-500 ease-out ${textColorClass}`}
      style={{ backgroundColor: getBackgroundColor() }}
    >
      {formatPrice(price)}
      <style jsx>{`
    .price-bg-flash-up {
      background-color: rgba(34, 197, 94, 0.3) !important;
    }
    .price-bg-flash-down {
      background-color: rgba(239, 68, 68, 0.3) !important;
    }
    .price-text-flash-up {
      color: #22c55e !important;
    }
    .price-text-flash-down {
      color: #ef4444 !important;
    }
  `}</style>
    </div>
  )
})

// Combined Index Card for all indices
const CombinedIndexCard = memo(function CombinedIndexCard({
  indicesData,
  tickCounts,
  allTicks,
  inactiveSymbols,
  onMarkAlertAsChecked,
  alertConfigurations,
  onConfigurationChange,
}: {
  indicesData: { [key: string]: InstrumentData }
  tickCounts: { [key: string]: number }
  allTicks: TickData[]
  inactiveSymbols: Set<number>
  onMarkAlertAsChecked?: (instrumentToken: number) => void
  alertConfigurations: Map<number, InactivityAlertConfig>
  onConfigurationChange: (token: number, config: InactivityAlertConfig) => void
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<InstrumentData | null>(null)

  const formatPrice = (price: number, instrumentName: string) => formatPriceWithDecimals(price, instrumentName)

  const formatVolume = (volume: number) => {
    if (volume >= 10000000) return `${(volume / 10000000).toFixed(1)}Cr`
    if (volume >= 100000) return `${(volume / 100000).toFixed(1)}L`
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`
    return volume.toString()
  }

  /**
   * Format a delay value in milliseconds into a human readable string.
   * @param delay - Delay in milliseconds
   * @returns Formatted string like "200ms", "1.2s", "0.5m" or "N/A"
   */
  const formatDelay = (delay: number) => {
    if (delay === 0) return "N/A"
    if (delay < 1000) return `${delay}ms`
    if (delay < 60000) return `${(delay / 1000).toFixed(1)}s`
    return `${(delay / 60000).toFixed(1)}m`
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover-lift card-smooth transition-colors">
      <CardContent className="p-2 space-y-2">
        {/* Combined Header */}
        <div className="text-center">
          <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide">INDICES</h3>
          <div className="flex justify-center gap-1 mt-0.5">
            <Badge
              variant="secondary"
              className="text-[9px] sm:text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1 py-0"
            >
              NSE
            </Badge>
            <Badge
              variant="secondary"
              className="text-[9px] sm:text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1 py-0"
            >
              BSE
            </Badge>
          </div>
        </div>

        {/* Render all indices in desired order */}
        {(() => {
          const ORDER = ["NIFTY 50", "SENSEX", "NIFTY BANK", "BANKEX"] as const
          const keys = ORDER.filter((n) => indicesData[n as string]).concat(
            Object.keys(indicesData)
              .filter((k) => !(ORDER as readonly string[]).includes(k))
              .sort(),
          )
          return keys.map((key, index) => {
            const data = indicesData[key]
            const isLast = index === keys.length - 1
            const indexName = getInstrumentName(data)
            const exchange = indexName.includes("SENSEX") ? "BSE" : "NSE"
            const isInactive = inactiveSymbols.has(data.instrument_token)

            return (
              <div
                key={key}
                className={`relative ${isLast ? "" : "border-b border-gray-200 dark:border-gray-600 pb-1.5 mb-1.5"} ${
                  isInactive
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-900/30 shadow-orange-200 dark:shadow-orange-800 shadow-lg ring-2 ring-orange-400 dark:ring-orange-600 animate-pulse"
                    : ""
                }`}
              >
                {/* Background price chart */}

                <div className="absolute inset-0 pointer-events-none">
                  <MiniPriceChart
                    ticks={allTicks}
                    instrumentToken={data.instrument_token}
                    height={60}
                    className="rounded"
                    useBookPrice={true}
                  />
                </div>
                <div className="relative flex items-center justify-between mb-1 z-10 py-px px-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-gray-100 bg-white/90 dark:bg-gray-800/90 px-2 rounded shadow-sm py-1">
                      {indexName}
                    </span>
                    <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1 py-0 font-medium">
                      {exchange}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 justify-center">
                    <Badge
                      variant={data.marketStatus?.isOpen ? "default" : "secondary"}
                      className="text-[9px] sm:text-[10px] px-1 py-0 font-medium"
                    >
                      {data.marketStatus?.session || "Unknown"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setSelectedIndex(data)
                        setIsSettingsOpen(true)
                      }}
                      className="w-4 h-4 bg-white/67 dark:bg-gray-700/67 hover:bg-white dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600 pointer-events-auto"
                    >
                      <Settings className="w-2 h-2 text-gray-600 dark:text-gray-400" />
                    </Button>
                  </div>
                </div>
                <div className="relative flex items-center justify-between mb-1 z-10">
                  <span
                    className={`text-base font-bold rounded shadow-sm price-display sm:text-sm py-[5px] px-2.5 ${
                      (data.dayTrend?.changePercent || 0) > 0
                        ? "text-green-700 dark:text-green-400 bg-green-50/95 dark:bg-green-900/50"
                        : (data.dayTrend?.changePercent || 0) < 0
                          ? "text-red-700 dark:text-red-400 bg-red-50/95 dark:bg-red-900/50"
                          : "text-gray-900 dark:text-gray-100 bg-white/90 dark:bg-gray-800/90"
                    }`}
                  >
                    {formatPrice(data.last_price, indexName)}
                  </span>
                  {(() => {
                    const composite = getDepthPlusLtpPrice(data)
                    return composite ? (
                      <div className="mt-0.5 text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 tabular-nums" />
                    ) : null
                  })()}
                  <div className="flex items-center gap-1">
                    <div
                      className={`text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded shadow-sm ${
                        (data.dayTrend?.changePercent || 0) > 0
                          ? "text-green-700 dark:text-green-400 bg-green-100/90 dark:bg-green-900/50"
                          : (data.dayTrend?.changePercent || 0) < 0
                            ? "text-red-700 dark:text-red-400 bg-red-100/90 dark:bg-red-900/50"
                            : "text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80"
                      }`}
                    >
                      {(data.dayTrend?.changePercent || 0) >= 0 ? "+" : ""}
                      {(data.dayTrend?.changePercent || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="relative grid grid-cols-3 gap-1 text-[9px] sm:text-[10px] z-10">
                  <div className="flex justify-between bg-white/80 dark:bg-gray-800/80 px-1 py-0.5 rounded">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Vol</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 mx-auto">
                      {formatVolume(data.volume || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between bg-white/80 dark:bg-gray-800/80 px-1 py-0.5 rounded">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Ticks</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 mx-auto">
                      {tickCounts[key] || 0}
                    </span>
                  </div>
                  <div className="flex justify-between bg-white/80 dark:bg-gray-800/80 px-1 py-0.5 rounded">
                    <span className="text-gray-500 dark:text-gray-400 font-medium mx-auto">Delay</span>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {formatDelay(data.delay || 0)}
                      </span>
                      {/* Alerts label removed for indices */}
                    </div>
                  </div>
                </div>
                {/* Alerts summary intentionally hidden for indices */}

                {isInactive && onMarkAlertAsChecked && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-auto z-20">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onMarkAlertAsChecked(data.instrument_token)}
                      className="h-7 px-2 text-[10px] bg-white/90 dark:bg-gray-700/70 border-orange-200 text-orange-700 hover:bg-orange-50 shadow-sm dark:hover:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300"
                      type="button"
                    >
                      ✓ Mark checked
                    </Button>
                  </div>
                )}
              </div>
            )
          })
        })()}
      </CardContent>
      {selectedIndex && (
        <SymbolAlertSettingsDialog
          isOpen={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          config={alertConfigurations.get(selectedIndex.instrument_token)}
          onSave={(config) => onConfigurationChange(selectedIndex.instrument_token, config)}
          symbolName={getInstrumentName(selectedIndex)}
        />
      )}
    </Card>
  )
})

// Memoized instrument card component
const InstrumentCard = memo(function InstrumentCard({
  instrument,
  instrumentTickCount,
  previousPrice,
  onShowTrades,
  allTicks,
  isInactive,
  alertConfig,
  onAlertConfigChange,
  onMarkAlertAsChecked,
}: {
  instrument: InstrumentData
  instrumentTickCount: number
  previousPrice: number | null
  onShowTrades: () => void
  allTicks: TickData[]
  isInactive: boolean
  alertConfig?: InactivityAlertConfig
  onAlertConfigChange: (config: InactivityAlertConfig) => void
  onMarkAlertAsChecked?: (instrumentToken: number) => void
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const name = getInstrumentName(instrument)
  const exchange = getExchange(instrument)
  const { trend, dayTrend, marketStatus } = instrument
  const displayTrend = dayTrend.change !== 0 ? dayTrend : trend

  const formatVolume = (volume: number) => {
    if (volume >= 10000000) return `${(volume / 10000000).toFixed(1)}Cr`
    if (volume >= 100000) return `${(volume / 100000).toFixed(1)}L`
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`
    return volume.toString()
  }

  const formatPrice = (price: number) => formatPriceWithDecimals(price, name)

  const cardClassName = `bg-white dark:bg-gray-800 border hover-lift card-smooth transition-colors ${
    isInactive
      ? "border-orange-500 bg-orange-50 dark:bg-orange-900/30 shadow-orange-200 dark:shadow-orange-800 shadow-lg ring-2 ring-orange-400 dark:ring-orange-600 animate-pulse"
      : "border-gray-200 dark:border-gray-700"
  }`

  return (
    <>
      <Card className={cardClassName}>
        <CardContent className="p-2 space-y-2">
          {/* modernize per-instrument alert overlay; compact banner fits card with inline action button */}
          {isInactive && (
            <div className="space-y-3 mb-4 p-3 bg-transparent">
              <Alert variant="warning" className="p-2 rounded-lg shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    <span className="text-sm font-medium">Price inactivity alert</span>
                  </div>
                  {onMarkAlertAsChecked && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onMarkAlertAsChecked(instrument.instrument_token)
                      }}
                      className="h-8 px-3 border-orange-200 text-orange-700 hover:bg-orange-50 dark:bg-orange-900/20 dark:hover:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300"
                      type="button"
                    >
                      ✓ Mark as checked
                    </Button>
                  )}
                </div>
              </Alert>
            </div>
          )}

          {/* Full Width Chart with Overlay */}
          <div className="w-full relative">
            <MiniPriceChart
              ticks={allTicks}
              instrumentToken={instrument.instrument_token}
              height={120}
              className="mb-1"
              useBookPrice={true}
            />
            {/* Chart Overlay Information */}
            <div
              className="absolute inset-0 flex flex-col justify-between px-2 py-[3px]"
              style={{ top: -2, width: "100%", height: "100%", minHeight: "100%" }}
            >
              {/* Top Section - Instrument Info and Settings */}
              <div className="flex justify-between items-start pointer-events-none">
                <div className="flex flex-col items-start">
                  <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 bg-white/90 dark:bg-gray-800/90 px-2 py-1 rounded shadow-sm">
                    {name}
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-semibold text-gray-700 dark:text-gray-300 bg-white/80 dark:bg-gray-800/80 px-1.5 py-0.5 rounded mt-1 text-center">
                    <span>{exchange}</span>
                    <span> • </span>
                    <span>{marketStatus.session}</span>
                  </div>
                </div>

                {/* Settings Button - always visible */}
                <div className="pointer-events-auto py-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsSettingsOpen(true)}
                    className="w-6 h-6 bg-white/67 dark:bg-gray-700/67 hover:bg-white dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600"
                  >
                    <Settings className="w-3 h-3 text-gray-600 dark:text-gray-400 py-0" />
                  </Button>
                </div>
              </div>

              {/* Bottom Right - Price Info with Enhanced Color Coding */}
              <div className="flex flex-col items-end pointer-events-none">
                <div
                  className={`text-base sm:text-lg font-bold px-2 py-1 rounded shadow-sm price-display ${
                    displayTrend.direction === "up"
                      ? "text-green-700 dark:text-green-400 bg-green-50/95 dark:bg-green-900/50"
                      : displayTrend.direction === "down"
                        ? "text-red-700 dark:text-red-400 bg-red-50/95 dark:bg-red-900/50"
                        : "text-gray-900 dark:text-gray-100 bg-white/90 dark:bg-gray-800/90"
                  }`}
                >
                  ₹{formatPrice(instrument.last_price)}
                </div>
                {(() => {
                  const composite = getDepthPlusLtpPrice(instrument)
                  return composite ? (
                    <div className="mt-0.5 text-[10px] sm:text-[10px] text-gray-600 dark:text-gray-400 tabular-nums" />
                  ) : null
                })()}
                <div
                  className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 shadow-sm ${
                    displayTrend.direction === "up"
                      ? "text-green-700 dark:text-green-400 bg-green-100/90 dark:bg-green-900/50"
                      : displayTrend.direction === "down"
                        ? "text-red-700 dark:text-red-400 bg-red-100/90 dark:bg-red-900/50"
                        : "text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80"
                  }`}
                >
                  {displayTrend.change > 0 ? "+" : ""}
                  {displayTrend.change.toFixed(2)} ({displayTrend.changePercent.toFixed(2)}%)
                </div>
              </div>
            </div>
          </div>

          {/* Stats Table */}
          <div className="mt-2">
            <table className="w-full text-[9px] sm:text-[10px] border-collapse table-fixed">
              <tbody>
                <tr>
                  <td className="text-gray-500 font-semibold py-0.5 border-b border-gray-200 dark:border-gray-700 text-center">
                    Vol
                  </td>
                  <td className="font-bold py-0.5 border-b border-gray-200 dark:border-gray-700 text-center whitespace-nowrap tabular-nums">
                    {formatVolume(instrument.volume)}
                  </td>
                  <td className="text-gray-500 font-semibold py-0.5 border-b border-gray-200 dark:border-gray-700 text-center">
                    AVG
                  </td>
                  <td className="font-bold py-0.5 border-b border-gray-200 dark:border-gray-700 text-center whitespace-nowrap tabular-nums">
                    {(() => {
                      const c = getDepthPlusLtpPrice(instrument)
                      return c != null ? formatPrice(c) : "-"
                    })()}
                  </td>
                  <td className="text-gray-500 font-semibold py-0.5 border-b border-gray-200 dark:border-gray-700 text-center">
                    LTQ
                  </td>
                  <td className="font-bold py-0.5 border-b border-gray-200 dark:border-gray-700 text-center whitespace-nowrap tabular-nums">
                    {instrument.last_quantity}
                  </td>
                </tr>
                <tr>
                  <td className="text-gray-500 font-semibold py-0.5 text-center border-t border-gray-200 dark:border-gray-700">
                    Ticks
                  </td>
                  <td className="font-bold text-center py-0.5 whitespace-nowrap tabular-nums border-t border-gray-200 dark:border-gray-700">
                    {instrumentTickCount}
                  </td>
                  <td className="text-gray-500 font-semibold py-0.5 text-center border-t border-gray-200 dark:border-gray-700">
                    Delay
                  </td>
                  <td
                    className={`font-bold py-0.5 text-center whitespace-nowrap tabular-nums border-t border-gray-200 dark:border-gray-700 ${
                      instrument.delay > 1000
                        ? "text-red-600"
                        : instrument.delay > 500
                          ? "text-yellow-600"
                          : "text-green-600"
                    }`}
                  >
                    {formatDelay(instrument.delay)}
                  </td>
                  <td className="text-gray-500 font-semibold py-0.5 text-center border-t border-gray-200 dark:border-gray-700">
                    Alerts
                  </td>
                  <td
                    className={`font-bold py-0.5 text-center border-t border-gray-200 dark:border-gray-700 ${alertConfig?.enabled || alertConfig?.dpltpEnabled ? "text-green-600" : "text-gray-400"}`}
                  >
                    {(() => {
                      const parts: string[] = []
                      if (alertConfig?.enabled) parts.push("LTP")
                      if (alertConfig?.dpltpEnabled) parts.push("Depth + LTP")
                      return parts.length ? `${parts.join(" + ")} On` : "OFF"
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Order Book Depth */}
          {(instrument.depth?.buy?.length ||
            instrument.depth?.sell?.length ||
            instrument.total_buy_quantity ||
            instrument.total_sell_quantity) && (
            <div className="mt-1 py-1 px-0 bg-white dark:bg-gray-800 rounded text-[13px] sm:text-[14px] leading-6">
              {/* Order Book Table */}
              {instrument.depth?.buy?.length || instrument.depth?.sell?.length ? (
                (() => {
                  const buyLevels = instrument.depth?.buy || []
                  const sellLevels = instrument.depth?.sell || []
                  const maxRows = Math.max(buyLevels.length, sellLevels.length, 5)

                  // Calculate total quantities
                  const totalBuyQty =
                    instrument.total_buy_quantity ||
                    (instrument.depth?.buy ? instrument.depth.buy.reduce((sum, level) => sum + level.quantity, 0) : 0)
                  const totalSellQty =
                    instrument.total_sell_quantity ||
                    (instrument.depth?.sell ? instrument.depth.sell.reduce((sum, level) => sum + level.quantity, 0) : 0)
                  const totalBuyOrders = buyLevels.reduce((sum, level) => sum + level.orders, 0)
                  const totalSellOrders = sellLevels.reduce((sum, level) => sum + level.orders, 0)

                  return (
                    <div className="text-[13px] sm:text-[14px]">
                      {/* Header Row */}
                      <div className="grid grid-cols-6 gap-0.5 text-[13px] sm:text-[14px] font-normal text-gray-500 dark:text-gray-400 mb-2 pb-0">
                        <div className="text-center text-blue-600 dark:text-blue-400 font-normal">Bids</div>
                        <div className="text-center text-blue-600 dark:text-blue-400 font-normal">Order</div>
                        <div className="text-center text-blue-600 dark:text-blue-400 font-normal">Qty</div>
                        <div className="text-center text-red-600 dark:text-red-400 font-normal">Offer</div>
                        <div className="text-center text-red-600 dark:text-red-400 font-normal">Order</div>
                        <div className="text-center text-red-600 dark:text-red-400 font-normal">Qty</div>
                      </div>

                      {/* Data Rows */}
                      {Array.from({ length: maxRows }).map((_, index) => {
                        const buyLevel = buyLevels[index]
                        const sellLevel = sellLevels[index]

                        // Calculate bar widths based on max quantities
                        const maxBuyQty = Math.max(...buyLevels.map((l) => l.quantity), 1)
                        const maxSellQty = Math.max(...sellLevels.map((l) => l.quantity), 1)
                        const buyBarWidth = buyLevel ? (buyLevel.quantity / maxBuyQty) * 100 : 0
                        const sellBarWidth = sellLevel ? (sellLevel.quantity / maxSellQty) * 100 : 0

                        return (
                          <div key={index} className="grid grid-cols-6 gap-0.5 text-[13px] py-0">
                            <div className="text-center text-blue-600 dark:text-blue-400 font-normal">
                              {buyLevel ? formatPrice(buyLevel.price) : "0"}
                            </div>
                            <div className="text-center text-blue-600 dark:text-blue-400 font-normal">
                              {buyLevel ? buyLevel.orders : "0"}
                            </div>
                            <div className="relative text-center text-blue-600 dark:text-blue-400">
                              <div
                                className="absolute inset-0 bg-blue-100 dark:bg-[rgba(71,109,252,0.8)] opacity-50"
                                style={{ width: `${buyBarWidth}%` }}
                              />
                              <span className="relative z-10 font-normal">
                                {buyLevel ? buyLevel.quantity.toLocaleString() : "0"}
                              </span>
                            </div>
                            <div className="text-center text-red-600 dark:text-red-400 font-normal">
                              {sellLevel ? formatPrice(sellLevel.price) : "0"}
                            </div>
                            <div className="text-center text-red-600 dark:text-red-400 font-normal">
                              {sellLevel ? sellLevel.orders : "0"}
                            </div>
                            <div className="relative text-center text-red-600 dark:text-red-400">
                              <div
                                className="absolute inset-0 bg-red-100 dark:bg-[rgba(255,73,73,0.73)] opacity-50"
                                style={{ width: `${sellBarWidth}%` }}
                              />
                              <span className="relative z-10 font-normal">
                                {sellLevel ? sellLevel.quantity.toLocaleString() : "0"}
                              </span>
                            </div>
                          </div>
                        )
                      })}

                      {/* Total Row */}
                      <div className="grid grid-cols-6 gap-0.5 text-[13px] sm:text-[14px] py-0 mt-2 font-normal">
                        <div className="text-center text-blue-600 dark:text-blue-400 font-normal">Total</div>
                        <div className="text-center text-blue-600 dark:text-blue-400 font-normal">{totalBuyOrders}</div>
                        <div className="text-center text-blue-600 dark:text-blue-400 font-normal">
                          {totalBuyQty.toLocaleString()}
                        </div>
                        <div className="text-center text-red-600 dark:text-red-400 font-normal">Total</div>
                        <div className="text-center text-red-600 dark:text-red-400 font-normal">{totalSellOrders}</div>
                        <div className="text-center text-red-600 dark:text-red-400 font-normal">
                          {totalSellQty.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )
                })()
              ) : (
                /* Fallback to simple totals if detailed depth not available */
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-[10px] sm:text-xs font-semibold mb-1 text-blue-900 dark:text-blue-300">
                      Total Buy Qty
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-blue-900 dark:text-blue-300">
                      {instrument.total_buy_quantity ? instrument.total_buy_quantity.toLocaleString() : "N/A"}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] sm:text-xs font-semibold mb-1 text-red-900 dark:text-red-300">
                      Total Sell Qty
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-red-900 dark:text-red-300">
                      {instrument.total_sell_quantity ? instrument.total_sell_quantity.toLocaleString() : "N/A"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Show More Button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs sm:text-sm"
            onClick={onShowTrades}
          >
            <span className="font-medium">Show last 10 trades</span>
            <ChevronDown className="w-3 sm:w-4 h-3 sm:h-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
      <SymbolAlertSettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        config={alertConfig}
        onSave={onAlertConfigChange}
        symbolName={name}
      />
    </>
  )
})

/**
 * MarketDataGrid is a comprehensive component that renders a set of cards and
 * tables representing the current market ticks, indices summary, and per-
 * instrument details. It accepts live ticks and alert configuration maps and
 * provides UI callbacks for configuration changes and marking alerts as checked.
 *
 * @param props.ticks - Array of TickData from the live feed
 * @param props.inactiveSymbols - Set of instrument tokens currently flagged as inactive
 * @param props.alertConfigurations - Map of per-instrument InactivityAlertConfig
 * @param props.onConfigurationChange - Callback when a symbol configuration is updated
 * @param props.onMarkAlertAsChecked - Optional callback invoked when an alert is marked checked
 */
export function MarketDataGrid({
  ticks,
  inactiveSymbols,
  alertConfigurations,
  onConfigurationChange,
  onMarkAlertAsChecked,
}: MarketDataGridProps) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [previousPrices, setPreviousPrices] = useState<Record<number, number>>({})
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentData | null>(null)
  const [sortField, setSortField] = useState<SortField>("time")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [filterDelay, setFilterDelay] = useState<string>("all")
  const [filterChange, setFilterChange] = useState<string>("all")
  const stableInstrumentOrder = useRef<number[]>([])

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const instrumentData = useMemo(() => {
    const grouped = new Map<number, TickData>()
    const recentTicks = ticks.slice(0, 100)
    for (const tick of recentTicks) {
      const key = tick.instrument_token
      if (!grouped.has(key) || tick.receivedAt > grouped.get(key)!.receivedAt) {
        grouped.set(key, tick)
      }
    }
    const validInstruments = Array.from(grouped.values()).filter((tick) => tick.last_price > 0)
    const currentTokens = validInstruments.map((tick) => tick.instrument_token)
    if (stableInstrumentOrder.current.length === 0) {
      stableInstrumentOrder.current = currentTokens.sort((a, b) => a - b).slice(0, 16)
    } else {
      const newTokens = currentTokens.filter((token) => !stableInstrumentOrder.current.includes(token))
      if (stableInstrumentOrder.current.length < 16) {
        const availableSlots = 16 - stableInstrumentOrder.current.length
        stableInstrumentOrder.current.push(...newTokens.slice(0, availableSlots))
      }
    }
    const orderedInstruments: InstrumentData[] = []
    for (const token of stableInstrumentOrder.current) {
      const tick = grouped.get(token)
      if (tick && tick.last_price > 0) {
        const instrumentName = getInstrumentName(tick)
        const marketType = getMarketTypeForInstrument(instrumentName)
        const marketStatus = getCurrentMarketStatus(marketType)
        const trend = calculatePriceTrend(tick, ticks)
        const dayTrend = calculateDayTrend(tick, ticks)
        orderedInstruments.push({ ...tick, marketStatus, trend, dayTrend })
      }
    }
    return orderedInstruments
  }, [ticks, currentTime])

  useEffect(() => {
    const newPreviousPrices: Record<number, number> = {}
    instrumentData.forEach((instrument) => {
      newPreviousPrices[instrument.instrument_token] = instrument.last_price
    })
    setPreviousPrices(newPreviousPrices)
  }, [instrumentData])

  const getLastTrades = (instrumentToken: number) => {
    const instrumentTicks = ticks
      .filter((tick) => tick.instrument_token === instrumentToken)
      .sort((a, b) => b.timestamp - a.timestamp) // Sort from most recent to oldest

    const uniquePriceTrades: TickData[] = []
    if (instrumentTicks.length > 0) {
      uniquePriceTrades.push(instrumentTicks[0]) // Always add the most recent tick

      for (let i = 1; i < instrumentTicks.length; i++) {
        // Compare current tick's price with the previous tick's price
        if (instrumentTicks[i].last_price !== instrumentTicks[i - 1].last_price) {
          uniquePriceTrades.push(instrumentTicks[i])
        }
        // Limit to 10 unique trades
        if (uniquePriceTrades.length >= 10) {
          break
        }
      }
    }
    return uniquePriceTrades
  }

  const getSortedAndFilteredTrades = (instrumentToken: number) => {
    let trades = getLastTrades(instrumentToken)

    // Apply filters
    if (filterDelay !== "all") {
      trades = trades.filter((trade) => {
        if (filterDelay === "low") return trade.delay <= 500
        if (filterDelay === "medium") return trade.delay > 500 && trade.delay <= 1000
        if (filterDelay === "high") return trade.delay > 1000
        return true
      })
    }

    if (filterChange !== "all") {
      trades = trades.filter((trade, index) => {
        const prevTrade = getLastTrades(instrumentToken)[index + 1]
        const priceChange = prevTrade ? trade.last_price - prevTrade.last_price : 0
        if (filterChange === "up") return priceChange > 0
        if (filterChange === "down") return priceChange < 0
        if (filterChange === "neutral") return priceChange === 0
        return true
      })
    }

    // Apply sorting
    trades.sort((a, b) => {
      let aValue: number, bValue: number

      switch (sortField) {
        case "time":
          aValue = a.timestamp
          bValue = b.timestamp
          break
        case "price":
          aValue = a.last_price
          bValue = b.last_price
          break
        case "quantity":
          aValue = a.last_quantity
          bValue = b.last_quantity
          break
        case "volume":
          aValue = a.volume
          bValue = b.volume
          break
        case "change":
          const aIndex = getLastTrades(instrumentToken).findIndex((t) => t.id === a.id)
          const bIndex = getLastTrades(instrumentToken).findIndex((t) => t.id === b.id)
          const aPrevTrade = getLastTrades(instrumentToken)[aIndex + 1]
          const bPrevTrade = getLastTrades(instrumentToken)[bIndex + 1]
          aValue = aPrevTrade ? a.last_price - aPrevTrade.last_price : 0
          bValue = bPrevTrade ? b.last_price - bPrevTrade.last_price : 0
          break
        default:
          return 0
      }

      return sortDirection === "asc" ? aValue - bValue : bValue - aValue
    })

    return trades
  }

  const formatVolume = (volume: number) => {
    if (volume >= 10000000) return `${(volume / 10000000).toFixed(1)}Cr`
    if (volume >= 100000) return `${(volume / 100000).toFixed(1)}L`
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`
    return volume.toString()
  }

  const formatPrice = (price: number, instrumentName?: string) => {
    if (instrumentName) {
      return formatPriceWithDecimals(price, instrumentName)
    }
    if (selectedInstrument) {
      return formatPriceWithDecimals(price, getInstrumentName(selectedInstrument))
    }
    return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const clearFilters = () => {
    setFilterDelay("all")
    setFilterChange("all")
    setSortField("time")
    setSortDirection("desc")
  }

  if (instrumentData.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 animate-pulse">
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {(() => {
          // Define indices token IDs and names
          const indicesTokens = [265, 256265, 260105, 12839] // SENSEX, NIFTY 50, NIFTY BANK, BANKEX
          const indicesNames = ["SENSEX", "NIFTY 50", "NIFTY", "NIFTY BANK", "BANKEX"]

          // Function to check if an instrument is an index
          const isIndex = (inst: InstrumentData) => {
            return (
              indicesTokens.includes(inst.instrument_token) ||
              indicesNames.includes(getInstrumentName(inst)) ||
              (inst.tradingsymbol && indicesNames.includes(inst.tradingsymbol))
            )
          }

          // Separate indices from other instruments
          const indicesData: { [key: string]: InstrumentData } = {}
          const tickCounts: { [key: string]: number } = {}

          // Find all indices by both token and name
          instrumentData.forEach((inst) => {
            if (isIndex(inst)) {
              const name = getInstrumentName(inst)
              indicesData[name] = inst
              tickCounts[name] = ticks.filter((t) => t.instrument_token === inst.instrument_token).length
            }
          })

          const otherInstruments = instrumentData.filter((inst) => !isIndex(inst))

          const cards = []

          // Add combined index card if we have any indices
          if (Object.keys(indicesData).length > 0) {
            cards.push(
              <CombinedIndexCard
                key="indices"
                indicesData={indicesData}
                tickCounts={tickCounts}
                allTicks={ticks}
                inactiveSymbols={inactiveSymbols}
                onMarkAlertAsChecked={onMarkAlertAsChecked}
                alertConfigurations={alertConfigurations}
                onConfigurationChange={onConfigurationChange}
              />,
            )
          }

          // Add other instrument cards (show more to include futures)
          const maxOtherCards = 15 // Show more cards to ensure futures are included

          // Sort other instruments by desired priority order
          const PRIORITY_SEQUENCE = [
            "RELIANCE_NSE",
            "RELIANCE_BSE",
            "NIFTY25OCTFUT",
            "SENSEX25OCTFUT",
            "CRUDEOIL25OCTFUT",
            "USDINR25OCTFUT",
          ] as const

          const normalize = (s?: string | null) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") : "")

          const getPriorityKey = (inst: InstrumentData) => {
            const symbol = normalize((inst as any).tradingsymbol) || normalize(getInstrumentName(inst))
            const exchange = normalize((inst as any).exchange) || normalize(getExchange(inst))
            if (symbol === "RELIANCE" && exchange) {
              return `${symbol}_${exchange}`
            }
            return symbol
          }

          const originalIndex = new Map<number, number>()
          otherInstruments.forEach((inst, idx) => originalIndex.set(inst.instrument_token, idx))

          const sortedOther = [...otherInstruments].sort((a, b) => {
            const aKey = getPriorityKey(a)
            const bKey = getPriorityKey(b)
            const rankOf = (key: string) => {
              const index = PRIORITY_SEQUENCE.findIndex((entry) => entry === key)
              return index === -1 ? Number.POSITIVE_INFINITY : index
            }
            const aRank = rankOf(aKey)
            const bRank = rankOf(bKey)
            if (aRank !== bRank) return aRank - bRank
            return (originalIndex.get(a.instrument_token) || 0) - (originalIndex.get(b.instrument_token) || 0)
          })

          const limitedInstruments = sortedOther.slice(0, Math.max(maxOtherCards, PRIORITY_SEQUENCE.length))

          limitedInstruments.forEach((instrument) => {
            const instrumentTickCount = ticks.filter((t) => t.instrument_token === instrument.instrument_token).length
            const isInactive = inactiveSymbols.has(instrument.instrument_token)

            cards.push(
              <InstrumentCard
                key={instrument.instrument_token}
                instrument={instrument}
                instrumentTickCount={instrumentTickCount}
                previousPrice={previousPrices[instrument.instrument_token] || null}
                onShowTrades={() => setSelectedInstrument(instrument)}
                allTicks={ticks}
                isInactive={isInactive}
                alertConfig={alertConfigurations.get(instrument.instrument_token)}
                onAlertConfigChange={(config) => onConfigurationChange(instrument.instrument_token, config)}
                onMarkAlertAsChecked={onMarkAlertAsChecked}
              />,
            )
          })

          return cards
        })()}
      </div>

      {/* Enhanced Mobile-First Trades Dialog */}
      <Dialog open={!!selectedInstrument} onOpenChange={() => setSelectedInstrument(null)}>
        <DialogContent className="w-[95vw] max-w-6xl h-[95vh] max-h-[95vh] p-0 gap-0">
          {/* Mobile-Optimized Header */}
          <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 flex-shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                    {selectedInstrument ? getInstrumentName(selectedInstrument) : ""}
                  </DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    Recent trading activity
                  </DialogDescription>
                </div>
              </div>
              {selectedInstrument && (
                <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Current</div>
                    <div className="text-sm sm:text-lg font-bold text-gray-900 dark:text-gray-100 price-display tabular-nums">
                      ₹{formatPrice(selectedInstrument.last_price)}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getExchange(selectedInstrument)}
                  </Badge>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="flex flex-col h-full min-h-0">
            {/* Mobile-First Controls */}
            <div className="px-4 sm:px-6 py-3 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0">
              <Tabs defaultValue="trades" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-9">
                  <TabsTrigger value="trades" className="text-xs sm:text-sm">
                    Trades
                  </TabsTrigger>
                  <TabsTrigger value="summary" className="text-xs sm:text-sm">
                    Summary
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="trades" className="mt-3 space-y-3">
                  {/* Touch-Friendly Sort & Filter Controls */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <div className="flex gap-2 flex-1">
                      <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                        <SelectTrigger className="h-9 text-xs sm:text-sm">
                          <div className="flex items-center gap-1">
                            {sortDirection === "asc" ? (
                              <SortAsc className="w-3 h-3" />
                            ) : (
                              <SortDesc className="w-3 h-3" />
                            )}
                            <SelectValue placeholder="Sort by" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="time">Time</SelectItem>
                          <SelectItem value="price">Price</SelectItem>
                          <SelectItem value="quantity">Quantity</SelectItem>
                          <SelectItem value="volume">Volume</SelectItem>
                          <SelectItem value="change">Change</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
                        className="h-9 px-2"
                      >
                        {sortDirection === "asc" ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />}
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Select value={filterDelay} onValueChange={setFilterDelay}>
                        <SelectTrigger className="h-9 text-xs sm:text-sm w-24 sm:w-28">
                          <div className="flex items-center gap-1">
                            <Filter className="w-3 h-3" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Delays</SelectItem>
                          <SelectItem value="low">Low (&lt;500ms)</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High (&gt;1s)</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={filterChange} onValueChange={setFilterChange}>
                        <SelectTrigger className="h-9 text-xs sm:text-sm w-20 sm:w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="up">Up</SelectItem>
                          <SelectItem value="down">Down</SelectItem>
                          <SelectItem value="neutral">Neutral</SelectItem>
                        </SelectContent>
                      </Select>

                      {(filterDelay !== "all" ||
                        filterChange !== "all" ||
                        sortField !== "time" ||
                        sortDirection !== "desc") && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2">
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="summary" className="mt-3">
                  {selectedInstrument && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total</div>
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {getLastTrades(selectedInstrument.instrument_token).length}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Vol</div>
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {formatVolume(
                            getLastTrades(selectedInstrument.instrument_token).reduce(
                              (sum, trade) => sum + trade.volume,
                              0,
                            ) / Math.max(getLastTrades(selectedInstrument.instrument_token).length, 1),
                          )}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">High</div>
                        <div className="text-sm font-bold text-green-600">
                          ₹
                          {formatPrice(
                            Math.max(...getLastTrades(selectedInstrument.instrument_token).map((t) => t.last_price)),
                          )}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700 text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Low</div>
                        <div className="text-sm font-bold text-red-600">
                          ₹
                          {formatPrice(
                            Math.min(...getLastTrades(selectedInstrument.instrument_token).map((t) => t.last_price)),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Mobile-Optimized Content */}
            <div className="flex-1 min-h-0">
              {/* Mobile Card View - Always Visible */}
              <div className="block lg:hidden h-full">
                <ScrollArea className="h-full px-4 py-2">
                  <div className="space-y-3 pb-4">
                    {selectedInstrument &&
                      getSortedAndFilteredTrades(selectedInstrument.instrument_token).map((trade, index) => {
                        const allTrades = getLastTrades(selectedInstrument.instrument_token)
                        const originalIndex = allTrades.findIndex((t) => t.id === trade.id)
                        const prevTrade = allTrades[originalIndex + 1]
                        const priceChange = prevTrade ? trade.last_price - prevTrade.last_price : 0
                        const changePercent =
                          prevTrade && prevTrade.last_price > 0 ? (priceChange / prevTrade.last_price) * 100 : 0

                        return (
                          <Card
                            key={trade.id}
                            className="overflow-hidden hover:shadow-md transition-shadow active:scale-[0.98]"
                          >
                            <CardContent className="p-4">
                              {/* Header Row */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-3 h-3 rounded-full ${
                                      priceChange > 0 ? "bg-green-500" : priceChange < 0 ? "bg-red-500" : "bg-gray-400"
                                    }`}
                                  />
                                  <span className="text-xs text-gray-500 font-mono">
                                    #{String(originalIndex + 1).padStart(2, "0")}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 font-medium">
                                  {new Date(trade.timestamp).toLocaleTimeString("en-IN", {
                                    timeZone: "Asia/Kolkata",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true,
                                  })}
                                </div>
                              </div>

                              {/* Price and Change Row */}
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">Trade Price</div>
                                  <div className="text-xl font-bold text-gray-900 dark:text-gray-100 price-display tabular-nums">
                                    ₹{formatPrice(trade.last_price)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs text-gray-500 mb-1">Change</div>
                                  <div
                                    className={`flex items-center justify-end gap-1 ${
                                      priceChange > 0
                                        ? "text-green-600"
                                        : priceChange < 0
                                          ? "text-red-600"
                                          : "text-gray-500"
                                    }`}
                                  >
                                    {priceChange > 0 && <TrendingUp className="w-3 h-3" />}
                                    {priceChange < 0 && <TrendingDown className="w-3 h-3" />}
                                    {priceChange === 0 && <Minus className="w-3 h-3" />}
                                    <div className="text-right">
                                      <div className="text-sm font-medium">
                                        {priceChange > 0 ? "+" : ""}
                                        {priceChange.toFixed(2)}
                                      </div>
                                      {changePercent !== 0 && (
                                        <div className="text-xs">
                                          {changePercent > 0 ? "+" : ""}
                                          {changePercent.toFixed(2)}%
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Stats Grid */}
                              <div className="grid grid-cols-3 gap-3 text-sm border-t pt-3">
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 mb-1">Quantity</div>
                                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                                    {trade.last_quantity.toLocaleString()}
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 mb-1">Volume</div>
                                  <div className="font-medium text-gray-700">{formatVolume(trade.volume)}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-gray-500 mb-1">Delay</div>
                                  <div
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      trade.delay > 1000
                                        ? "bg-red-100 text-red-700"
                                        : trade.delay > 500
                                          ? "bg-yellow-100 text-yellow-700"
                                          : "bg-green-100 text-green-700"
                                    }`}
                                  >
                                    {formatDelay(trade.delay)}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                  </div>
                </ScrollArea>
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block h-full p-6">
                <ScrollArea className="h-full">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableHead className="w-12">#</TableHead>
                        <TableHead className="w-24 cursor-pointer" onClick={() => handleSort("time")}>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Time
                            {sortField === "time" &&
                              (sortDirection === "asc" ? (
                                <SortAsc className="w-3 h-3" />
                              ) : (
                                <SortDesc className="w-3 h-3" />
                              ))}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort("price")}>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Price
                            {sortField === "price" &&
                              (sortDirection === "asc" ? (
                                <SortAsc className="w-3 h-3" />
                              ) : (
                                <SortDesc className="w-3 h-3" />
                              ))}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort("quantity")}>
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            Quantity
                            {sortField === "quantity" &&
                              (sortDirection === "asc" ? (
                                <SortAsc className="w-3 h-3" />
                              ) : (
                                <SortDesc className="w-3 h-3" />
                              ))}
                          </div>
                        </TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort("volume")}>
                          Volume
                          {sortField === "volume" &&
                            (sortDirection === "asc" ? (
                              <SortAsc className="w-3 h-3 ml-1" />
                            ) : (
                              <SortDesc className="w-3 h-3 ml-1" />
                            ))}
                        </TableHead>
                        <TableHead>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Delay
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInstrument &&
                        getSortedAndFilteredTrades(selectedInstrument.instrument_token).map((trade, index) => {
                          const allTrades = getLastTrades(selectedInstrument.instrument_token)
                          const originalIndex = allTrades.findIndex((t) => t.id === trade.id)
                          const prevTrade = allTrades[originalIndex + 1]
                          const priceChange = prevTrade ? trade.last_price - prevTrade.last_price : 0
                          const changePercent =
                            prevTrade && prevTrade.last_price > 0 ? (priceChange / prevTrade.last_price) * 100 : 0

                          return (
                            <TableRow key={trade.id} className="hover:bg-blue-50/50 transition-colors">
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-2 h-2 rounded-full ${
                                      priceChange > 0 ? "bg-green-500" : priceChange < 0 ? "bg-red-500" : "bg-gray-400"
                                    }`}
                                  />
                                  <span className="text-xs font-mono text-gray-500">
                                    {String(originalIndex + 1).padStart(2, "0")}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div className="font-medium">
                                    {new Date(trade.timestamp).toLocaleTimeString("en-IN", {
                                      timeZone: "Asia/Kolkata",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {new Date(trade.timestamp).toLocaleDateString("en-IN", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-right">
                                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100 price-display tabular-nums">
                                    ₹{formatPrice(trade.last_price)}
                                  </div>
                                  {changePercent !== 0 && (
                                    <div className={`text-xs ${changePercent > 0 ? "text-green-600" : "text-red-600"}`}>
                                      {changePercent > 0 ? "+" : ""}
                                      {changePercent.toFixed(2)}%
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-right">
                                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                                    {trade.last_quantity.toLocaleString()}
                                  </div>
                                  <div className="text-xs text-gray-500">shares</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-right">
                                  <div className="font-medium text-gray-700">{formatVolume(trade.volume)}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div
                                  className={`flex items-center justify-center gap-2 ${
                                    priceChange > 0
                                      ? "text-green-600"
                                      : priceChange < 0
                                        ? "text-red-600"
                                        : "text-gray-500"
                                  }`}
                                >
                                  {priceChange > 0 && <TrendingUp className="w-4 h-4" />}
                                  {priceChange < 0 && <TrendingDown className="w-4 h-4" />}
                                  {priceChange === 0 && <Minus className="w-4 h-4" />}
                                  <div className="text-right">
                                    <div className="font-medium">
                                      {priceChange > 0 ? "+" : ""}
                                      {priceChange.toFixed(2)}
                                    </div>
                                    <div className="text-xs">₹{Math.abs(priceChange).toFixed(2)}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-center">
                                  <div
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      trade.delay > 1000
                                        ? "bg-red-100 text-red-700"
                                        : trade.delay > 500
                                          ? "bg-yellow-100 text-yellow-700"
                                          : "bg-green-100 text-green-700"
                                    }`}
                                  >
                                    {formatDelay(trade.delay)}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
