export type DepthSide = { price: number; quantity?: number; orders?: number }
export type Depth = { buy?: DepthSide[]; sell?: DepthSide[] }

export type TickLike = {
  last_price?: number
  average_price?: number
  depth?: Depth
}

/**
 * Average helper that returns null if no valid numbers are provided.
 */
function mean(values: number[]): number | null {
  const nums = values.filter((n) => Number.isFinite(n))
  if (nums.length === 0) return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return sum / nums.length
}

/**
 * Compute the average of prices for a given depth side.
 */
function avgDepthPrice(side?: DepthSide[]): number | null {
  if (!side || side.length === 0) return null
  const prices = side
    .map((l) => (typeof l?.price === "number" && isFinite(l.price) && l.price > 0 ? l.price : Number.NaN))
    .filter((p) => Number.isFinite(p)) as number[]
  return prices.length ? mean(prices) : null
}

/**
 * Depth + LTP price:
 * Average of [avgBidPrice, avgAskPrice, LTP] using only the available valid values.
 * If none are valid, falls back to average_price, else 0.
 */
export function depthPlusLtp(tick: TickLike): number {
  const ltp = typeof tick?.last_price === "number" ? tick.last_price : Number.NaN
  const bidAvg = avgDepthPrice(tick?.depth?.buy)
  const askAvg = avgDepthPrice(tick?.depth?.sell)

  const parts: number[] = []
  if (Number.isFinite(bidAvg as number)) parts.push(bidAvg as number)
  if (Number.isFinite(askAvg as number)) parts.push(askAvg as number)
  if (Number.isFinite(ltp)) parts.push(ltp as number)

  const combined = mean(parts)
  if (combined !== null) return combined

  // Fallbacks
  if (typeof tick?.average_price === "number" && isFinite(tick.average_price)) {
    return tick.average_price
  }
  return 0
}
