"use client"

import { useMemo, memo, useCallback } from "react"
import { Bell, Settings2, Clock, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { TickData } from "@/hooks/use-tick-data"
import type { InactivityAlertConfig } from "@/hooks/use-inactivity-alerts"
import { getInstrumentName, getExchange } from "./market-data-grid"
import { getDetailedMarketStatus } from "@/utils/market-timings"

interface AlertSettingsTabProps {
  ticks: TickData[]
  alertConfigurations: Map<number, InactivityAlertConfig>
  onConfigurationChange: (token: number, config: InactivityAlertConfig) => void
  inactiveSymbols: Set<number>
}

interface SymbolInfo {
  token: number
  name: string
  exchange: string
  lastPrice: number
  isActive: boolean
  config?: InactivityAlertConfig
  marketStatus: ReturnType<typeof getDetailedMarketStatus>
  isIndex: boolean
}

// Helper function to check if an instrument is an index
const isIndex = (token: number, name: string) => {
  const indicesTokens = [265, 256265, 260105, 26009, 12839] // SENSEX, NIFTY, NIFTY BANK, BANKNIFTY, BANKEX
  const indicesNames = ["SENSEX", "NIFTY 50", "NIFTY", "NIFTY BANK", "BANKNIFTY", "BANKEX"]
  return indicesTokens.includes(token) || indicesNames.includes(name)
}

// Memoized SymbolCard component to prevent unnecessary re-renders
const SymbolCard = memo(function SymbolCard({
  symbol,
  config,
  onConfigChange,
}: {
  symbol: SymbolInfo
  config: InactivityAlertConfig
  onConfigChange: (config: InactivityAlertConfig) => void
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <div className="font-medium text-sm">{symbol.name}</div>
              <div className="text-xs text-gray-500">{symbol.exchange}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={symbol.marketStatus.isOpen ? "default" : "secondary"} className="text-xs">
              {symbol.marketStatus.session}
            </Badge>
            {symbol.isActive ? (
              <Badge variant="outline" className="text-green-600 text-xs">
                Active
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">
                Alerting
              </Badge>
            )}
          </div>
        </div>

        {/* Controls Grid */}
        <div className="space-y-3">
          {/* LTP Alert Section */}
          <div className="p-2 bg-blue-50 border border-blue-200 rounded">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-blue-900">Enable LTP</Label>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(checked) => onConfigChange({ ...config, enabled: checked })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-blue-900">Duration (s)</Label>
                <Input
                  type="number"
                  value={config.duration}
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      duration: Math.max(0, Number.parseInt(e.target.value) || 20),
                    })
                  }
                  min="0"
                  max="1000"
                  className="text-xs h-8"
                  disabled={!config.enabled && !symbol.isIndex}
                />
              </div>
            </div>
          </div>

          {/* Depth + LTP Alert Section */}
          <div
            className="p-2 bg-green-50 border border-green-200 rounded"
            style={{ display: symbol.isIndex ? "none" : "block" }}
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-green-900">Enable Depth + LTP</Label>
                <Switch
                  checked={config.dpltpEnabled || false}
                  onCheckedChange={(checked) => onConfigChange({ ...config, dpltpEnabled: checked })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-green-900">Duration (s)</Label>
                <Input
                  type="number"
                  value={config.dpltpDuration || 60}
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      dpltpDuration: Math.max(0, Number.parseInt(e.target.value) || 60),
                    })
                  }
                  min="0"
                  max="1000"
                  className="text-xs h-8"
                  disabled={!config.dpltpEnabled}
                />
              </div>
            </div>
          </div>

          {/* Common Settings */}
          <div className="p-2 bg-gray-50 border border-gray-200 rounded">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Market Hours</Label>
              <Switch
                checked={config.respectMarketHours}
                onCheckedChange={(checked) => onConfigChange({ ...config, respectMarketHours: checked })}
                disabled={!config.enabled && !config.dpltpEnabled}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

export function AlertSettingsTab({
  ticks,
  alertConfigurations,
  onConfigurationChange,
  inactiveSymbols,
}: AlertSettingsTabProps) {
  // Removed manual save system - all changes now auto-save
  // Removed search, filter, and bulk configuration features

  // Get unique symbols from ticks
  const availableSymbols = useMemo(() => {
    const symbolMap = new Map<number, SymbolInfo>()

    ticks.forEach((tick) => {
      if (!symbolMap.has(tick.instrument_token) || tick.receivedAt > symbolMap.get(tick.instrument_token)!.lastPrice) {
        const config = alertConfigurations.get(tick.instrument_token)
        const instrumentName = getInstrumentName(tick)
        const marketStatus = getDetailedMarketStatus(instrumentName)

        symbolMap.set(tick.instrument_token, {
          token: tick.instrument_token,
          name: instrumentName,
          exchange: getExchange(tick),
          lastPrice: tick.last_price,
          isActive: !inactiveSymbols.has(tick.instrument_token),
          config,
          marketStatus,
          isIndex: isIndex(tick.instrument_token, instrumentName),
        })
      }
    })

    return Array.from(symbolMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [ticks, alertConfigurations, inactiveSymbols])

  // No filtering - show all available symbols

  // Statistics
  const stats = useMemo(() => {
    const total = availableSymbols.length
    const enabled = availableSymbols.filter((s) => s.config?.enabled || s.config?.dpltpEnabled).length
    const alerting = availableSymbols.filter((s) => !s.isActive).length
    const marketOpen = availableSymbols.filter((s) => s.marketStatus.isOpen).length

    return { total, enabled, alerting, marketOpen }
  }, [availableSymbols])

  const handleSymbolConfigChange = useCallback(
    (token: number, config: InactivityAlertConfig) => {
      // Auto-save immediately
      onConfigurationChange(token, config)
    },
    [onConfigurationChange],
  )

  const getEffectiveConfig = (symbol: SymbolInfo): InactivityAlertConfig => {
    if (symbol.config) return symbol.config
    const isIdx = symbol.isIndex
    const exchange = symbol.exchange.toUpperCase()
    if (isIdx) {
      console.log("[v0] Getting effective config for index", symbol.name, "defaulting to enabled: true")
      return { enabled: true, duration: 20, respectMarketHours: true, dpltpEnabled: false, dpltpDuration: 0 }
    }
    const defaults: Record<string, number> = { NSE: 10, BSE: 10, NFO: 10, BFO: 10, CDS: 300, BCD: 300, MCX: 180 }
    const dpltp = defaults[exchange] ?? 60
    return { enabled: false, duration: 30, respectMarketHours: true, dpltpEnabled: true, dpltpDuration: dpltp }
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 max-w-full overflow-hidden">
      {/* Header - Responsive */}
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate font-mono">
            Alert Settings
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">
            Configure price inactivity alerts for trading symbols
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 font-mono">
          <Badge
            variant="outline"
            className="text-green-600 dark:text-green-400 border-green-200 dark:border-green-700"
          >
            Auto-Save
          </Badge>
        </div>
      </div>

      {/* Statistics Cards - Responsive Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="min-w-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/50 rounded shrink-0">
                <Settings2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">Total Symbols</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-100 dark:bg-green-900/50 rounded shrink-0">
                <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">Alerts Enabled</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.enabled}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-red-100 dark:bg-red-900/50 rounded shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">Currently Alerting</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.alerting}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-100 dark:bg-purple-900/50 rounded shrink-0">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">Markets Open</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.marketOpen}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Individual Symbol Alert Configuration */}

      {/* Mobile-Optimized Symbols Table */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Symbol Alert Configuration</CardTitle>
          <CardDescription className="text-sm">
            Configure individual alert settings for each trading symbol
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {/* Mobile Card View */}
          <div className="block sm:hidden">
            <div className="space-y-2 p-3">
              {availableSymbols.map((symbol) => {
                const config = getEffectiveConfig(symbol)

                return (
                  <Card key={symbol.token} className="transform-gpu">
                    <CardContent className="p-3 space-y-2">
                      {/* Header Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium text-sm">{symbol.name}</div>
                            <div className="text-xs text-gray-500">{symbol.exchange}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={symbol.marketStatus.isOpen ? "default" : "secondary"} className="text-xs">
                            {symbol.marketStatus.session}
                          </Badge>
                          {symbol.isActive ? (
                            <Badge variant="outline" className="text-green-600 text-xs">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Alerting
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Controls Grid */}
                      <div className="space-y-2">
                        {/* LTP Alert Section */}
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-blue-900">Enable LTP Alerts</Label>
                              <Switch
                                // Always show indices as enabled and allow toggling
                                checked={config.enabled}
                                onCheckedChange={(checked) =>
                                  handleSymbolConfigChange(symbol.token, { ...config, enabled: checked })
                                }
                                // Remove disabled state for indices to allow user control
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-blue-900">LTP Duration (seconds)</Label>
                              <Input
                                type="number"
                                value={config.duration}
                                onChange={(e) =>
                                  handleSymbolConfigChange(symbol.token, {
                                    ...config,
                                    duration: Math.max(0, Number.parseInt(e.target.value) || 20),
                                  })
                                }
                                min="0"
                                max="1000"
                                className="text-xs h-8"
                                disabled={!config.enabled && !symbol.isIndex}
                                placeholder="20"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Depth + LTP Alert Section */}
                        {!symbol.isIndex && (
                          <div className="p-2 bg-green-50 border border-green-200 rounded">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-green-900">Enable Depth + LTP Alerts</Label>
                                <Switch
                                  checked={config.dpltpEnabled || false}
                                  onCheckedChange={(checked) =>
                                    handleSymbolConfigChange(symbol.token, { ...config, dpltpEnabled: checked })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-medium text-green-900">
                                  Depth + LTP Duration (seconds)
                                </Label>
                                <Input
                                  type="number"
                                  value={config.dpltpDuration || 60}
                                  onChange={(e) =>
                                    handleSymbolConfigChange(symbol.token, {
                                      ...config,
                                      dpltpDuration: Math.max(0, Number.parseInt(e.target.value) || 60),
                                    })
                                  }
                                  min="0"
                                  max="1000"
                                  className="text-xs h-8"
                                  disabled={!config.dpltpEnabled}
                                  placeholder="60"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Common Settings */}
                        <div className="p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded">
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">Market Hours</Label>
                            <Switch
                              checked={config.respectMarketHours}
                              onCheckedChange={(checked) =>
                                handleSymbolConfigChange(symbol.token, { ...config, respectMarketHours: checked })
                              }
                              disabled={!config.enabled && !config.dpltpEnabled}
                            />
                            <div className="text-xs text-gray-600">
                              {config.respectMarketHours
                                ? "Alerts active during trading hours only"
                                : "Alerts active 24/7"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Preview */}
                      <div className="pt-2 border-t">
                        {config.enabled || config.dpltpEnabled ? (
                          <div className="space-y-1 text-xs text-gray-600">
                            {config.enabled && <div>• LTP alert if price unchanged for {config.duration}s</div>}
                            {config.dpltpEnabled && (
                              <div>• Depth + LTP alert if price unchanged for {config.dpltpDuration || 60}s</div>
                            )}
                            <div className="text-gray-500">
                              {config.respectMarketHours ? "(trading hours only)" : "(24/7 monitoring)"}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">Disabled</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>LTP Alerts</TableHead>
                  <TableHead>Depth + LTP</TableHead>
                  <TableHead>Market Hours</TableHead>
                  <TableHead>Preview</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableSymbols.map((symbol) => {
                  const config = getEffectiveConfig(symbol)

                  return (
                    <TableRow key={symbol.token}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{symbol.name}</div>
                          <div className="text-xs text-gray-500">{symbol.exchange}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant={symbol.marketStatus.isOpen ? "default" : "secondary"} className="text-xs">
                            {symbol.marketStatus.session}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            ({symbol.marketStatus.marketType.toUpperCase()})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {symbol.isActive ? (
                          <Badge variant="outline" className="text-green-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Alerting</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2 flex flex-col">
                          <div className="flex items-center gap-2 justify-center">
                            <Switch
                              // Always show indices as enabled and allow toggling
                              checked={config.enabled}
                              onCheckedChange={(checked) =>
                                handleSymbolConfigChange(symbol.token, { ...config, enabled: checked })
                              }
                              // Remove disabled state for indices to allow user control
                            />
                            <span className="text-xs">LTP</span>
                          </div>
                          {config.enabled && (
                            <Input
                              type="number"
                              value={config.duration}
                              onChange={(e) =>
                                handleSymbolConfigChange(symbol.token, {
                                  ...config,
                                  duration: Math.max(0, Number.parseInt(e.target.value) || 20),
                                })
                              }
                              min="0"
                              max="1000"
                              className="w-16 text-xs mx-auto"
                              placeholder="20"
                              disabled={false}
                            />
                          )}
                        </div>
                      </TableCell>
                      {/* Market Depth column - Hidden for indices */}
                      {!symbol.isIndex ? (
                        <TableCell>
                          <div className="space-y-2 flex flex-col">
                            <div className="flex items-center gap-2 justify-center">
                              <Switch
                                checked={config.dpltpEnabled || false}
                                onCheckedChange={(checked) =>
                                  handleSymbolConfigChange(symbol.token, { ...config, dpltpEnabled: checked })
                                }
                              />
                              <span className="text-xs">Depth+LTP</span>
                            </div>
                            {config.dpltpEnabled && (
                              <Input
                                type="number"
                                value={config.dpltpDuration || 60}
                                onChange={(e) =>
                                  handleSymbolConfigChange(symbol.token, {
                                    ...config,
                                    dpltpDuration: Math.max(0, Number.parseInt(e.target.value) || 60),
                                  })
                                }
                                min="0"
                                max="1000"
                                className="w-16 text-xs mx-auto"
                                placeholder="60"
                              />
                            )}
                          </div>
                        </TableCell>
                      ) : (
                        <TableCell>
                          <div className="text-xs text-gray-400">N/A for indices</div>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center justify-center">
                          <Switch
                            checked={config.respectMarketHours}
                            onCheckedChange={(checked) =>
                              handleSymbolConfigChange(symbol.token, { ...config, respectMarketHours: checked })
                            }
                            disabled={!config.enabled && !config.dpltpEnabled}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {config.enabled || config.dpltpEnabled ? (
                          <div className="space-y-1 text-xs text-gray-600">
                            {config.enabled && <div>• LTP: {config.duration}s</div>}
                            {config.dpltpEnabled && <div>• Depth+LTP: {config.dpltpDuration || 60}s</div>}
                            <div className="text-gray-500">
                              {config.respectMarketHours ? "(trading hours)" : "(24/7)"}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">Disabled</div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
