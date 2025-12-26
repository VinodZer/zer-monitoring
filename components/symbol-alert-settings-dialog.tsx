"use client"

import { useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Clock, AlertTriangle, Bell, Settings2 } from "lucide-react"
import type { InactivityAlertConfig } from "@/hooks/use-inactivity-alerts"
import { getDetailedMarketStatus, getMarketTypeForInstrument } from "@/utils/market-timings"
import { getDefaultDpltpDuration, getExchangeFromName } from "@/utils/exchange-detection"

interface SymbolAlertSettingsDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  config?: InactivityAlertConfig
  onSave: (config: InactivityAlertConfig) => void
  symbolName: string
}

const DEFAULT_CONFIG: InactivityAlertConfig = {
  enabled: true,
  duration: 15,
  dpltpEnabled: false,
  dpltpDuration: 60,
  respectMarketHours: true,
}

// Helper function to check if an instrument is an index
const isIndex = (symbolName: string) => {
  const indicesNames = ["SENSEX", "NIFTY 50", "NIFTY", "NIFTY BANK", "BANKNIFTY", "BANKEX"]
  return indicesNames.includes(symbolName)
}

export function SymbolAlertSettingsDialog({
  isOpen,
  onOpenChange,
  config,
  onSave,
  symbolName,
}: SymbolAlertSettingsDialogProps) {
  const isIndexSymbol = isIndex(symbolName)
  const marketType = getMarketTypeForInstrument(symbolName)
  const marketStatus = getDetailedMarketStatus(symbolName)
  const exchangeCode = getExchangeFromName(symbolName)
  const extendedDurationSegment = exchangeCode === "MCX" || exchangeCode === "CDS"
  const baseDuration = extendedDurationSegment ? 30 : 15
  const baseDpltpDuration = getDefaultDpltpDuration(exchangeCode)

  // Use actual config directly, auto-save on changes
  const defaultConfig = isIndexSymbol
    ? { ...DEFAULT_CONFIG, enabled: true, duration: 15, dpltpEnabled: false, dpltpDuration: 0 }
    : { ...DEFAULT_CONFIG, enabled: false, duration: baseDuration, dpltpEnabled: true, dpltpDuration: baseDpltpDuration }
  const currentConfig = config || defaultConfig
  const effectiveConfig: InactivityAlertConfig = isIndexSymbol
    ? { ...currentConfig, dpltpEnabled: false, dpltpDuration: 0 }
    : currentConfig

  // Auto-save helper function
  const updateConfig = (updates: Partial<InactivityAlertConfig>) => {
    const newConfig = { ...currentConfig, ...updates }
    onSave(newConfig)
  }

  // Get market information for this symbol

  const getMarketTimingInfo = () => {
    switch (marketType) {
      case "equity":
        return {
          sessions: "Pre-market (9:00-9:15), Normal (9:15-15:30), Post-market (15:30-16:00)",
          days: "Monday to Friday (excluding holidays)",
        }
      case "currency":
        return {
          sessions: "Normal (9:00-17:00)",
          days: "Monday to Friday (excluding holidays)",
        }
      case "commodity":
        return {
          sessions: "Normal (9:00-23:30)",
          days: "Monday to Friday (excluding holidays)",
        }
      default:
        return {
          sessions: "Normal (9:00-17:00)",
          days: "Monday to Friday (excluding holidays)",
        }
    }
  }

  const timingInfo = getMarketTimingInfo()

  useEffect(() => {
    if (!isOpen || !isIndexSymbol) return
    const enforced: InactivityAlertConfig = {
      ...currentConfig,
      dpltpEnabled: false,
      dpltpDuration: 0,
    }
    if (
      (currentConfig.dpltpEnabled ?? false) !== enforced.dpltpEnabled ||
      (currentConfig.dpltpDuration ?? 0) !== enforced.dpltpDuration
    ) {
      onSave(enforced)
    }
  }, [isOpen, isIndexSymbol])

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Alert Settings
          </DialogTitle>
          <DialogDescription>
            Configure inactivity alerts for <strong>{symbolName}</strong> ({marketType.toUpperCase()})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Market Status */}
          <div
            className={`p-3 rounded-lg border ${
              marketStatus.isOpen
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4" />
              <span className="font-medium">Current Market Status</span>
              <Badge variant={marketStatus.isOpen ? "default" : "secondary"}>{marketStatus.session}</Badge>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">{marketStatus.reason}</p>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              <div>Sessions: {timingInfo.sessions}</div>
              <div>Trading Days: {timingInfo.days}</div>
            </div>
          </div>

          {/* LTP Alerts */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <Label className="text-base font-medium text-blue-900 dark:text-blue-300">LTP Alerts</Label>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="ltpEnabled" className="text-sm font-medium">
                    Enable LTP Alerts
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">Alert when last traded price stays unchanged</p>
                </div>
                <Switch
                  id="ltpEnabled"
                  checked={effectiveConfig.enabled}
                  onCheckedChange={(checked) => {
                    updateConfig({ enabled: checked })
                  }}
                />
              </div>

              {effectiveConfig.enabled && (
                <div className="space-y-2">
                  <Label htmlFor="ltpDuration" className="text-sm font-medium">
                    Duration (seconds)
                  </Label>
                  <Input
                    id="ltpDuration"
                    type="number"
                    value={effectiveConfig.duration}
                    onChange={(e) => {
                      const duration = Math.max(0, Number.parseInt(e.target.value) || baseDuration)
                      updateConfig({ duration })
                    }}
                    min="0"
                    max="1000"
                    className="w-full"
                    placeholder={String(baseDuration)}
                    disabled={false}
                  />
                  <p className="text-xs text-muted-foreground">Alert if LTP doesn't change for this duration</p>
                </div>
              )}
            </div>
          </div>

          {/* Depth + LTP Alerts (hidden for indices) */}
          {!isIndexSymbol && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-4 h-4 text-green-700 dark:text-green-400" />
                <Label className="text-base font-medium text-green-900 dark:text-green-300">Depth + LTP Alerts</Label>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="dpltpEnabled" className="text-sm font-medium">
                      Enable Depth + LTP Alerts
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">Alert when Depth + LTP price stays unchanged</p>
                  </div>
                  <Switch
                    id="dpltpEnabled"
                    checked={effectiveConfig.dpltpEnabled || false}
                    onCheckedChange={(checked) => updateConfig({ dpltpEnabled: checked })}
                  />
                </div>

                {effectiveConfig.dpltpEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="dpltpDuration" className="text-sm font-medium">
                      Duration (seconds)
                    </Label>
                    <Input
                      id="dpltpDuration"
                      type="number"
                      value={effectiveConfig.dpltpDuration || baseDpltpDuration}
                      onChange={(e) => {
                        const dpltpDuration = Math.max(0, Number.parseInt(e.target.value) || baseDpltpDuration)
                        updateConfig({ dpltpDuration })
                      }}
                      min="0"
                      max="1000"
                      className="w-full"
                      placeholder={String(baseDpltpDuration)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Alert if Depth + LTP price doesn't change for this duration
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Common Settings */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="respectMarketHours" className="text-sm font-medium">
                    Respect Market Hours
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Only trigger alerts during official trading hours
                  </p>
                </div>
                <Switch
                  id="respectMarketHours"
                  checked={currentConfig.respectMarketHours}
                  onCheckedChange={(checked) => updateConfig({ respectMarketHours: checked })}
                  disabled={!currentConfig.enabled && !currentConfig.dpltpEnabled}
                />
              </div>

              {!currentConfig.respectMarketHours && (
                <div className="flex items-start gap-2 p-2 bg-orange-50 border border-orange-200 rounded">
                  <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-orange-800">
                    <p className="font-medium">Warning: 24/7 Monitoring</p>
                    <p>
                      Alerts will trigger even when markets are closed. This may result in alerts during non-trading
                      hours when price data might be stale.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          {(effectiveConfig.enabled || effectiveConfig.dpltpEnabled) && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-800 mb-2">Alert Configuration Summary:</p>
              <div className="space-y-1 text-sm text-blue-700">
                {effectiveConfig.enabled && (
                  <div>• LTP alert if price unchanged for {effectiveConfig.duration} seconds</div>
                )}
                {effectiveConfig.dpltpEnabled && (
                  <div>
                    • Depth + LTP alert if price unchanged for {effectiveConfig.dpltpDuration || baseDpltpDuration} seconds
                  </div>
                )}
                <div className="text-xs text-blue-600 mt-2">
                  {effectiveConfig.respectMarketHours
                    ? `Active during: ${timingInfo.sessions}`
                    : "Active 24/7 (including non-trading hours)"}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
