"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  History,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  Search,
  SortAsc,
  SortDesc,
  Clock,
  AlertTriangle,
  Target,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import type { InactivityAlert } from "@/hooks/use-inactivity-alerts"
import type { TickData } from "@/hooks/use-tick-data"

interface InactivityAlertsLogProps {
  alerts: InactivityAlert[]
  onClearAlerts: () => void
  onMarkAlertAsChecked: (alertId: string) => void
  ticks?: TickData[]
}

type SortField = "timestamp" | "symbol" | "severity" | "duration" | "priceChange"
type SortDirection = "asc" | "desc"
type SeverityFilter = "all" | "high" | "medium" | "low"

export function InactivityAlertsLog({ alerts, onClearAlerts, onMarkAlertAsChecked, ticks = [] }: InactivityAlertsLogProps) {
  const [sortField, setSortField] = useState<SortField>("timestamp")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  // Get the latest LTP for a given instrument token
  const getLatestLtp = (instrumentToken: number): number | null => {
    for (let i = ticks.length - 1; i >= 0; i--) {
      if (ticks[i].instrument_token === instrumentToken && ticks[i].last_price > 0) {
        return ticks[i].last_price
      }
    }
    return null
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)
  }

  const formatPriceRange = (min: number, max: number) => {
    if (min === max) {
      return `₹${formatPrice(min)}`
    }
    return `₹${formatPrice(min)} - ₹${formatPrice(max)}`
  }

  const getPriceMovementIcon = (baseline: number, current: number) => {
    if (current > baseline) return <TrendingUp className="w-4 h-4 text-green-600" />
    if (current < baseline) return <TrendingDown className="w-4 h-4 text-red-600" />
    return <Minus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
  }

  const getAlertSeverity = (alert: InactivityAlert) => {
    // Severity based on actual missing seconds and price stability
    const usedSeconds = alert.missingSeconds ?? alert.duration
    const priceRange = alert.priceRange.max - alert.priceRange.min
    const relativeStability = priceRange / alert.baselinePrice

    if (usedSeconds >= 120 && relativeStability < 0.001) return "high" // Very long duration with extremely stable price
    if (usedSeconds >= 60 && relativeStability < 0.005) return "medium" // Medium duration with stable price
    return "low"
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "high":
        return (
          <Badge variant="destructive" className="text-xs font-medium bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700">
            <AlertTriangle className="w-3 h-3 mr-1" />
            High
          </Badge>
        )
      case "medium":
        return (
          <Badge variant="outline" className="text-xs font-medium border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700">
            <Target className="w-3 h-3 mr-1" />
            Medium
          </Badge>
        )
      case "low":
        return (
          <Badge variant="outline" className="text-xs font-medium border-blue-300 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700">
            <Activity className="w-3 h-3 mr-1" />
            Low
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-xs font-medium dark:bg-gray-800 dark:text-gray-200">
            Unknown
          </Badge>
        )
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "border-l-red-500 bg-red-50 dark:bg-red-900/20 dark:border-red-700"
      case "medium":
        return "border-l-orange-500 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700"
      case "low":
        return "border-l-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700"
      default:
        return "border-l-gray-500 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
    }
  }

  const filteredAndSortedAlerts = useMemo(() => {
    const filtered = alerts.filter((alert) => {
      const severity = getAlertSeverity(alert)
      const matchesSeverity = severityFilter === "all" || severity === severityFilter
      const matchesSearch = searchTerm === "" || alert.instrumentName.toLowerCase().includes(searchTerm.toLowerCase())

      return matchesSeverity && matchesSearch
    })

    return filtered.sort((a, b) => {
      let aValue: any, bValue: any

      switch (sortField) {
        case "timestamp":
          aValue = new Date(a.timestamp).getTime()
          bValue = new Date(b.timestamp).getTime()
          break
        case "symbol":
          aValue = a.instrumentName
          bValue = b.instrumentName
          break
        case "severity":
          aValue = getAlertSeverity(a)
          bValue = getAlertSeverity(b)
          const severityOrder = { high: 3, medium: 2, low: 1 }
          aValue = severityOrder[aValue as keyof typeof severityOrder] || 0
          bValue = severityOrder[bValue as keyof typeof severityOrder] || 0
          break
        case "duration":
          aValue = a.duration
          bValue = b.duration
          break
        case "priceChange":
          aValue = Math.abs(a.currentPrice - a.baselinePrice)
          bValue = Math.abs(b.currentPrice - b.baselinePrice)
          break
        default:
          return 0
      }

      if (sortDirection === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })
  }, [alerts, sortField, sortDirection, severityFilter, searchTerm])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === "asc" ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
  }

  const clearFilters = () => {
    setSeverityFilter("all")
    setSearchTerm("")
    setSortField("timestamp")
    setSortDirection("desc")
  }

  const toggleCardExpansion = (alertId: string) => {
    setExpandedCard(expandedCard === alertId ? null : alertId)
  }

  const AlertCard = ({ alert }: { alert: InactivityAlert }) => {
    const severity = getAlertSeverity(alert)
    const latestLtp = getLatestLtp(alert.instrumentToken)
    const currentLtp = latestLtp !== null ? latestLtp : alert.currentPrice
    const priceChange = currentLtp - alert.ltpAtTrigger
    const changePercent = alert.ltpAtTrigger > 0 ? (priceChange / alert.ltpAtTrigger) * 100 : 0
    const isExpanded = expandedCard === alert.id

    return (
      <Card
        className={`mb-3 border-l-4 ${getSeverityColor(severity)} ${alert.checked ? 'opacity-60 bg-gray-50 dark:bg-gray-800' : ''} transition-all duration-200 hover:shadow-md active:scale-[0.98]`}
        onClick={() => toggleCardExpansion(alert.id)}
      >
        <CardContent className="p-4">
          {/* Header Row */}
          <div className="flex flex-col gap-3 mb-3">
            {/* Top row: Symbol and Severity */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg text-gray-900 dark:text-gray-100">{alert.instrumentName}</span>
                {alert.exchange && (
                  <Badge variant="outline" className="text-xs text-gray-600 dark:text-gray-400">
                    {alert.exchange}
                  </Badge>
                )}
                <Badge variant={alert.alertType === 'dpltp' ? 'default' : 'secondary'} className="text-xs">
                  {alert.alertType === 'dpltp' ? 'Depth+LTP' : 'LTP'}
                </Badge>
                {getSeverityBadge(severity)}
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  {(alert.missingSeconds ?? alert.duration)}s
                </Badge>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>

            {/* Action Row: Mark as Checked Button */}
            <div className="flex items-center justify-center">
              {!alert.checked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMarkAlertAsChecked(alert.id)
                  }}
                  className="w-full h-8 text-sm bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 font-medium dark:bg-blue-900/20 dark:hover:bg-blue-800/30 dark:border-blue-700 dark:text-blue-300"
                >
                  �� Mark as Checked
                </Button>
              )}
              {alert.checked && (
                <div className="w-full text-center">
                  <Badge variant="outline" className="text-sm bg-green-50 text-green-700 border-green-200 px-4 py-1 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700">
                    ✓ Checked
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Price Information */}
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">LTP at Alert Time</p>
              <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">₹{formatPrice(alert.ltpAtTrigger)}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Price</p>
              <div className="flex items-center gap-1">
                {getPriceMovementIcon(alert.ltpAtTrigger, currentLtp)}
                <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">₹{formatPrice(currentLtp)}</span>
              </div>
              {priceChange !== 0 && (
                <span className={`text-xs font-medium ${priceChange > 0 ? "text-green-600" : "text-red-600"}`}>
                  ({priceChange > 0 ? "+" : ""}
                  {priceChange.toFixed(2)})
                </span>
              )}
            </div>
          </div>

          {/* Timestamp */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {new Date(alert.timestamp).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                hour12: true,
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
<span>Duration: {(alert.missingSeconds ?? alert.duration)}s</span>
          </div>

          {/* Expanded Details */}
          {isExpanded && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Price Range During Alert</p>
                  <p className="font-mono text-sm text-gray-900 dark:text-gray-100">{formatPriceRange(alert.priceRange.min, alert.priceRange.max)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Range: ₹{formatPrice(alert.priceRange.max - alert.priceRange.min)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Alert Details</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {alert.alertType === 'dpltp' ? (
                      `Depth + LTP price remained unchanged for ${ (alert.missingSeconds ?? alert.duration) } seconds`
                    ) : (
                      `LTP remained unchanged at ₹${alert.baselinePrice.toFixed(2)} for ${ (alert.missingSeconds ?? alert.duration) } seconds`
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const SummaryStats = () => {
    const stats = useMemo(() => {
      const severityCounts = { high: 0, medium: 0, low: 0 }
      const totalAlerts = filteredAndSortedAlerts.length

      filteredAndSortedAlerts.forEach((alert) => {
        const severity = getAlertSeverity(alert)
        severityCounts[severity as keyof typeof severityCounts]++
      })

      const avgDuration =
        totalAlerts > 0 ? filteredAndSortedAlerts.reduce((sum, alert) => sum + (alert.missingSeconds ?? alert.duration), 0) / totalAlerts : 0

      return { severityCounts, totalAlerts, avgDuration }
    }, [filteredAndSortedAlerts])

    return (
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalAlerts}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Alerts</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-300">{stats.avgDuration.toFixed(0)}s</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Avg Duration</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <div className="text-lg font-bold text-red-600 dark:text-red-300">{stats.severityCounts.high}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">High Severity</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <div className="text-lg font-bold text-orange-600 dark:text-orange-300">{stats.severityCounts.medium}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Medium Severity</div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <Card className="w-full max-w-full">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <History className="w-5 h-5" />
              Alert Log
            </CardTitle>
            <CardDescription className="text-sm">Monitor and analyze price inactivity alerts</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAlerts}
            disabled={alerts.length === 0}
            className="w-full sm:w-auto bg-transparent"
          >
            <X className="w-4 h-4 mr-2" />
            Clear Log ({alerts.length})
          </Button>
        </div>

        {/* Mobile-First Controls */}
        <div className="space-y-4 pt-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-12"
            />
          </div>

          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={severityFilter} onValueChange={(value: SeverityFilter) => setSeverityFilter(value)}>
              <SelectTrigger className="h-12">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <SelectValue placeholder="Filter by severity" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="high">High Severity</SelectItem>
                <SelectItem value="medium">Medium Severity</SelectItem>
                <SelectItem value="low">Low Severity</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortField} onValueChange={(value: SortField) => setSortField(value)}>
              <SelectTrigger className="h-12">
                <div className="flex items-center gap-2">
                  {getSortIcon(sortField) || <SortDesc className="w-4 h-4" />}
                  <SelectValue placeholder="Sort by" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="timestamp">Sort by Time</SelectItem>
                <SelectItem value="symbol">Sort by Symbol</SelectItem>
                <SelectItem value="severity">Sort by Severity</SelectItem>
                <SelectItem value="duration">Sort by Duration</SelectItem>
                <SelectItem value="priceChange">Sort by Price Change</SelectItem>
              </SelectContent>
            </Select>

            {(severityFilter !== "all" || searchTerm !== "" || sortField !== "timestamp") && (
              <Button variant="outline" onClick={clearFilters} className="h-12 px-6 bg-transparent">
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <History className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No alerts yet</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm">
              Configure alert settings to start monitoring price inactivity patterns
            </p>
          </div>
        ) : (
          <Tabs defaultValue="alerts" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mx-4 mb-4">
              <TabsTrigger value="alerts" className="text-sm">
                Alerts ({filteredAndSortedAlerts.length})
              </TabsTrigger>
              <TabsTrigger value="summary" className="text-sm">
                Summary
              </TabsTrigger>
            </TabsList>

            <TabsContent value="alerts" className="px-4 pb-4">
              {/* Desktop Table View */}
              <div className="hidden lg:block">
                <ScrollArea className="h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer hover:bg-muted/30 dark:hover:bg-muted/30" onClick={() => handleSort("timestamp")}>
                          <div className="flex items-center" style={{ margin: "auto 0" }}>Timestamp {getSortIcon("timestamp")}</div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/30 dark:hover:bg-muted/30" onClick={() => handleSort("symbol")}>
                          <div className="flex items-center" style={{ margin: "auto 0" }}>Symbol {getSortIcon("symbol")}</div>
                        </TableHead>
                        <TableHead>Exchange</TableHead>
                        <TableHead>LTP at Alert Time</TableHead>
                        <TableHead>Current Price</TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/30 dark:hover:bg-muted/30" onClick={() => handleSort("duration")}>
                          <div className="flex items-center" style={{ margin: "auto 0" }}>Duration {getSortIcon("duration")}</div>
                        </TableHead>

                        <TableHead className="cursor-pointer hover:bg-muted/30 dark:hover:bg-muted/30" onClick={() => handleSort("severity")}>
                          <div className="flex items-center" style={{ margin: "auto 0" }}>Severity {getSortIcon("severity")}</div>
                        </TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedAlerts.map((alert) => {
                        const severity = getAlertSeverity(alert)
                        const latestLtp = getLatestLtp(alert.instrumentToken)
                        const currentLtp = latestLtp !== null ? latestLtp : alert.currentPrice
                        const priceChange = currentLtp - alert.ltpAtTrigger

                        return (
                          <TableRow key={alert.id} className={`${alert.checked ? 'opacity-60 bg-muted/40 dark:bg-muted/20' : ''}`}>
                            <TableCell className="font-mono text-sm">
                              {new Date(alert.timestamp).toLocaleString("en-IN", {
                                timeZone: "Asia/Kolkata",
                                hour12: false,
                                month: "short",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="font-medium">{alert.instrumentName}</TableCell>
                            <TableCell className="text-gray-600 dark:text-gray-400 text-sm">{alert.exchange || '-'}</TableCell>
                            <TableCell className="font-mono">₹{formatPrice(alert.ltpAtTrigger)}</TableCell>
                            <TableCell className="font-mono">
                              <div className="flex items-center gap-1">
                                {getPriceMovementIcon(alert.ltpAtTrigger, currentLtp)}
                                <span>₹{formatPrice(currentLtp)}</span>
                                {priceChange !== 0 && (
                                  <span className={`text-xs ${priceChange > 0 ? "text-green-600" : "text-red-600"}`}>
                                    ({priceChange > 0 ? "+" : ""}
                                    {priceChange.toFixed(2)})
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {(alert.missingSeconds ?? alert.duration)}s
                              </Badge>
                            </TableCell>

                            <TableCell>{getSeverityBadge(severity)}</TableCell>
                            <TableCell>
                              {!alert.checked ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onMarkAlertAsChecked(alert.id)}
                                  className="h-7 px-2 text-xs bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 font-medium dark:bg-blue-900/20 dark:hover:bg-blue-800/30 dark:border-blue-700 dark:text-blue-300"
                                >
                                  ✓ Mark as Checked
                                </Button>
                              ) : (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700">
                                  ✓ Checked
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden">
                <ScrollArea className="h-[60vh]">
                  {filteredAndSortedAlerts.length > 0 ? (
                    <div className="space-y-1">
                      {filteredAndSortedAlerts.map((alert) => (
                        <AlertCard key={alert.id} alert={alert} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Filter className="w-12 h-12 text-gray-300 mb-4" />
                      <p className="text-gray-500">No alerts match your current filters</p>
                      <Button variant="outline" onClick={clearFilters} className="mt-4 bg-transparent">
                        Clear Filters
                      </Button>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="summary" className="px-4 pb-4">
              <SummaryStats />

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/20 dark:border-blue-700">
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-3">Alert Severity Guide:</h4>
                <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      High
                    </Badge>
                    <span>Very minimal price movement (&lt;50% of threshold)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 bg-orange-50">
                      <Target className="w-3 h-3 mr-1" />
                      Medium
                    </Badge>
                    <span>Limited movement (50-80% of threshold)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 bg-blue-50">
                      <Activity className="w-3 h-3 mr-1" />
                      Low
                    </Badge>
                    <span>Movement close to threshold (&gt;80%)</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
