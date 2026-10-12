import { memo } from "react"
import Svg, { Circle, Path, Rect } from "react-native-svg"
import { Paper } from "../../theme"

/**
 * One rounded, stroked icon set.
 *
 * All paths are drawn in a 24x24 box with round caps and joins, so they sit
 * with the soft geometry of the rest of the system. Icons are decorative by
 * default — give the pressable around them the accessibility label.
 */
export type IconName =
  | "record"
  | "activity"
  | "clock"
  | "user"
  | "settings"
  | "grid"
  | "arrowRight"
  | "arrowLeft"
  | "chevronRight"
  | "chevronDown"
  | "check"
  | "close"
  | "play"
  | "pause"
  | "target"
  | "zap"
  | "trending"
  | "sparkle"
  | "shield"
  | "bell"
  | "download"
  | "trash"
  | "info"
  | "lock"
  | "mail"
  | "eye"
  | "eyeOff"
  | "share"
  | "trophy"
  | "plus"
  | "ruler"
  | "compare"

const PATHS: Record<IconName, (p: { c: string; w: number }) => React.ReactNode> = {
  record: ({ c, w }) => (
    <>
      <Path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" stroke={c} strokeWidth={w} strokeLinejoin="round" fill="none" />
      <Circle cx={12} cy={13} r={3.6} stroke={c} strokeWidth={w} fill="none" />
    </>
  ),
  activity: ({ c, w }) => (
    <Path d="M3 13h3.5l2.5-7 4 14 2.8-7H21" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  clock: ({ c, w }) => (
    <>
      <Circle cx={12} cy={12} r={8.6} stroke={c} strokeWidth={w} fill="none" />
      <Path d="M12 7.4V12l3.2 2" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  user: ({ c, w }) => (
    <>
      <Circle cx={12} cy={8.5} r={3.6} stroke={c} strokeWidth={w} fill="none" />
      <Path d="M4.8 20c.9-3.7 3.7-5.6 7.2-5.6s6.3 1.9 7.2 5.6" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
    </>
  ),
  settings: ({ c, w }) => (
    <>
      <Circle cx={12} cy={12} r={3} stroke={c} strokeWidth={w} fill="none" />
      <Path d="M12 3.2v2.1M12 18.7v2.1M20.8 12h-2.1M5.3 12H3.2M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5M18.2 18.2l-1.5-1.5M7.3 7.3 5.8 5.8" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
    </>
  ),
  grid: ({ c, w }) => (
    <>
      <Rect x={3.4} y={3.4} width={7.2} height={7.2} rx={2.2} stroke={c} strokeWidth={w} fill="none" />
      <Rect x={13.4} y={3.4} width={7.2} height={7.2} rx={2.2} stroke={c} strokeWidth={w} fill="none" />
      <Rect x={3.4} y={13.4} width={7.2} height={7.2} rx={2.2} stroke={c} strokeWidth={w} fill="none" />
      <Rect x={13.4} y={13.4} width={7.2} height={7.2} rx={2.2} stroke={c} strokeWidth={w} fill="none" />
    </>
  ),
  arrowRight: ({ c, w }) => (
    <Path d="M4.5 12h14m0 0-5.2-5.2M18.5 12l-5.2 5.2" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  arrowLeft: ({ c, w }) => (
    <Path d="M19.5 12h-14m0 0 5.2-5.2M5.5 12l5.2 5.2" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  chevronRight: ({ c, w }) => (
    <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  chevronDown: ({ c, w }) => (
    <Path d="m5.5 9.5 6.5 6.5 6.5-6.5" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  check: ({ c, w }) => (
    <Path d="m4.8 12.6 4.6 4.6L19.2 7.4" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  close: ({ c, w }) => (
    <Path d="M6 6l12 12M18 6 6 18" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
  ),
  play: ({ c, w }) => (
    <Path d="M8.5 5.8 18 12l-9.5 6.2z" stroke={c} strokeWidth={w} strokeLinejoin="round" fill="none" />
  ),
  pause: ({ c, w }) => (
    <Path d="M9.2 5.6v12.8M14.8 5.6v12.8" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
  ),
  target: ({ c, w }) => (
    <>
      <Circle cx={12} cy={12} r={8.6} stroke={c} strokeWidth={w} fill="none" />
      <Circle cx={12} cy={12} r={4.4} stroke={c} strokeWidth={w} fill="none" />
      <Circle cx={12} cy={12} r={1.1} fill={c} />
    </>
  ),
  zap: ({ c, w }) => (
    <Path d="M13.4 2.8 5.2 13.4h5.6l-.6 7.8 8.2-10.6h-5.6z" stroke={c} strokeWidth={w} strokeLinejoin="round" fill="none" />
  ),
  trending: ({ c, w }) => (
    <Path d="M3.5 16.5 9.3 10.7l3.4 3.4 7.8-7.8m0 0h-5.1m5.1 0v5.1" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  sparkle: ({ c, w }) => (
    <Path d="M12 3.2 13.9 9 19.7 10.9 13.9 12.8 12 18.6 10.1 12.8 4.3 10.9 10.1 9z" stroke={c} strokeWidth={w} strokeLinejoin="round" fill="none" />
  ),
  shield: ({ c, w }) => (
    <Path d="M12 3.2 19.3 6v6c0 4.3-3 7.4-7.3 8.8C7.7 19.4 4.7 16.3 4.7 12V6z" stroke={c} strokeWidth={w} strokeLinejoin="round" fill="none" />
  ),
  bell: ({ c, w }) => (
    <>
      <Path d="M6.6 10.2a5.4 5.4 0 0 1 10.8 0c0 4 1.4 5.6 1.4 5.6H5.2s1.4-1.6 1.4-5.6" stroke={c} strokeWidth={w} strokeLinejoin="round" fill="none" />
      <Path d="M10.2 19a2 2 0 0 0 3.6 0" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
    </>
  ),
  download: ({ c, w }) => (
    <Path d="M12 3.8v10.4m0 0 4-4m-4 4-4-4M4.6 17.4v1.2a1.8 1.8 0 0 0 1.8 1.8h11.2a1.8 1.8 0 0 0 1.8-1.8v-1.2" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  trash: ({ c, w }) => (
    <Path d="M4.8 6.6h14.4M9.6 6.6V4.8h4.8v1.8M6.6 6.6l.9 12a1.8 1.8 0 0 0 1.8 1.6h5.4a1.8 1.8 0 0 0 1.8-1.6l.9-12" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  info: ({ c, w }) => (
    <>
      <Circle cx={12} cy={12} r={8.6} stroke={c} strokeWidth={w} fill="none" />
      <Path d="M12 11v5.2" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={7.9} r={1.1} fill={c} />
    </>
  ),
  lock: ({ c, w }) => (
    <>
      <Rect x={4.8} y={10.2} width={14.4} height={9.6} rx={2.6} stroke={c} strokeWidth={w} fill="none" />
      <Path d="M8.4 10.2V7.8a3.6 3.6 0 0 1 7.2 0v2.4" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
    </>
  ),
  mail: ({ c, w }) => (
    <>
      <Rect x={3.4} y={5.4} width={17.2} height={13.2} rx={2.6} stroke={c} strokeWidth={w} fill="none" />
      <Path d="m4.4 8 6.5 4.6a2 2 0 0 0 2.2 0L19.6 8" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
    </>
  ),
  eye: ({ c, w }) => (
    <>
      <Path d="M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12" stroke={c} strokeWidth={w} strokeLinejoin="round" fill="none" />
      <Circle cx={12} cy={12} r={2.8} stroke={c} strokeWidth={w} fill="none" />
    </>
  ),
  eyeOff: ({ c, w }) => (
    <>
      <Path d="M9.6 6.8A8.6 8.6 0 0 1 12 6.4c6 0 9.4 5.6 9.4 5.6a16 16 0 0 1-3 3.6M6.2 8.3A15.8 15.8 0 0 0 2.6 12S6 17.6 12 17.6a8.8 8.8 0 0 0 3.2-.6" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M4.4 4.4l15.2 15.2" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
    </>
  ),
  share: ({ c, w }) => (
    <Path d="M12 15.6V4.2m0 0L8.2 8M12 4.2 15.8 8M5 14v4.8a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V14" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  trophy: ({ c, w }) => (
    <Path d="M7.4 4.4h9.2v4.4a4.6 4.6 0 0 1-9.2 0zM7.4 5.6H4.8v1.8a3 3 0 0 0 2.6 3M16.6 5.6h2.6v1.8a3 3 0 0 1-2.6 3M12 13.4v3.4M8.8 19.6h6.4" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  plus: ({ c, w }) => (
    <Path d="M12 5.4v13.2M5.4 12h13.2" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
  ),
  ruler: ({ c, w }) => (
    <>
      <Rect x={2.6} y={8.4} width={18.8} height={7.2} rx={2.2} stroke={c} strokeWidth={w} fill="none" />
      <Path d="M7 8.4v3M11 8.4v4.4M15 8.4v3M19 8.4v4.4" stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
    </>
  ),
  compare: ({ c, w }) => (
    <Path d="M12 3.4v17.2M7.4 8.2 3.6 12l3.8 3.8M16.6 8.2 20.4 12l-3.8 3.8" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
}

interface IconProps {
  name: IconName
  size?: number
  color?: string
  /** Stroke width in the 24-unit box. */
  weight?: number
}

export const Icon = memo(function Icon({ name, size = 22, color = Paper.ink, weight = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name]({ c: color, w: weight })}
    </Svg>
  )
})
