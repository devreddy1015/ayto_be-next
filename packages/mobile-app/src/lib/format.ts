import type { SpeedUnit } from "../types"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** 1680 -> "28:00". */
export function clock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

/** "2025-05-25" -> "25 May". Manual so it renders identically on Hermes and the web. */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Masthead dateline: "Thu 9 Oct". */
export function dateline(d: Date = new Date()): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function greeting(d: Date = new Date()): string {
  const h = d.getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

export function speed(kmh: number, unit: SpeedUnit): number {
  return Math.round(unit === "mph" ? kmh * 0.621371 : kmh)
}

export function speedUnitLabel(unit: SpeedUnit): string {
  return unit === "mph" ? "mph" : "km/h"
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
