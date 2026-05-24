const BADMINTON_COURT_LENGTH_M = 13.4
const BADMINTON_COURT_WIDTH_M = 6.1

export function calculateSpeed(
  prevX: number,
  prevY: number,
  currX: number,
  currY: number,
  courtLengthPx: number,
  fps: number,
): number {
  const pixelsPerMeter = courtLengthPx / BADMINTON_COURT_LENGTH_M
  const dx = currX - prevX
  const dy = currY - prevY
  const pixelDisplacement = Math.sqrt(dx * dx + dy * dy)
  const speedMPerS = (pixelDisplacement / pixelsPerMeter) * fps
  const speedKmh = speedMPerS * 3.6
  return Math.round(speedKmh * 10) / 10
}

export function estimatePixelsPerMeter(
  frameWidth: number,
  frameHeight: number,
): number {
  const estimatedCourtLengthPx = Math.min(frameWidth, frameHeight) * 0.65
  return estimatedCourtLengthPx / BADMINTON_COURT_LENGTH_M
}

export function getCourtDimensions(): { lengthM: number; widthM: number } {
  return { lengthM: BADMINTON_COURT_LENGTH_M, widthM: BADMINTON_COURT_WIDTH_M }
}

export function pixelToCourtPosition(
  px: number,
  py: number,
  courtOriginX: number,
  courtOriginY: number,
  pixelsPerMeter: number,
): { courtX: number; courtY: number } {
  return {
    courtX: (px - courtOriginX) / pixelsPerMeter,
    courtY: (py - courtOriginY) / pixelsPerMeter,
  }
}

export function convertSpeedUnit(
  speedKmh: number,
  unit: "kmh" | "mph",
): number {
  if (unit === "mph") return speedKmh * 0.621371
  return speedKmh
}

export function getSpeedColor(speedKmh: number): string {
  if (speedKmh < 100) return "#FFFFFF"
  if (speedKmh < 200) return "#00FF87"
  if (speedKmh < 300) return "#FFB300"
  return "#FF6B6B"
}
