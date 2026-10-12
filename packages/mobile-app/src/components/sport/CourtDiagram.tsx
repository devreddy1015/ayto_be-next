import { memo, useMemo } from "react"
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg"
import { getCourt, type CourtPlan } from "../../data/courts"
import type { Sport } from "../../sports"
import { Fonts, Paper, Radius, Space, Type } from "../../theme"
import { Icon } from "../ui/Icon"
import { Reveal } from "../ui/Motion"

/** Horizontal half-angle of each phone lens, in degrees. */
const HALF_FOV = { main: 34.5, ultrawide: 53 } as const

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)]
  const [x1, y1] = a(from)
  const [x2, y2] = a(to)
  const large = Math.abs(to - from) > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

/** Plain-English placement, so "0 m outside the sideline" never reaches a user. */
function placement(plan: CourtPlan): string {
  const c = plan.camera
  if (!c) return ""
  const across = c.out === 0 ? "on the centre line" : `${c.out} m outside the sideline`
  const end = c.side === "far" ? "the back wall" : "the baseline"
  return `${across}, ${c.back} m behind ${end}, ${c.height} m up`
}

/** Where the phone stands, in the same court frame as the lines. */
function cameraPoint(plan: CourtPlan): { x: number; y: number } | null {
  if (!plan.camera) return null
  const { out, back, side } = plan.camera
  return {
    x: -out,
    y: side === "far" ? plan.length + back : -back,
  }
}

interface Props {
  sport: Sport
  /** Draw the phone and its field of view. */
  showCamera?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * One court, drawn from its rulebook.
 *
 * The SVG viewBox is in METRES, so a 40 mm badminton line is `strokeWidth`
 * 0.04 and every mark lands where the tape measure says. Stroke widths scale
 * off the court diagonal so a table-tennis table and a football pitch both
 * read at the same size on screen.
 */
export const CourtDiagram = memo(function CourtDiagram({ sport, showCamera = true, style }: Props) {
  const plan = getCourt(sport.id)
  const { palette } = sport
  const cam = showCamera ? cameraPoint(plan) : null

  const view = useMemo(() => {
    const pad = Math.max(plan.width, plan.length) * 0.06
    let minX = -pad
    let minY = -pad
    let maxX = plan.width + pad
    let maxY = plan.length + pad
    if (cam) {
      minX = Math.min(minX, cam.x - pad)
      minY = Math.min(minY, cam.y - pad)
      maxX = Math.max(maxX, cam.x + pad)
      maxY = Math.max(maxY, cam.y + pad)
    }
    return { minX, minY, w: maxX - minX, h: maxY - minY }
  }, [cam, plan.length, plan.width])

  const diag = Math.hypot(plan.width, plan.length)
  const w = {
    boundary: Math.max(0.05, diag * 0.0055),
    line: Math.max(0.04, diag * 0.0035),
    faint: Math.max(0.03, diag * 0.0025),
  }
  const dot = diag * 0.022

  // The lens cone, drawn only as far as the far baseline so it frames rather
  // than floods the diagram.
  const cone = useMemo(() => {
    if (!cam) return null
    const aim = Math.atan2(plan.length / 2 - cam.y, plan.width / 2 - cam.x)
    const reach = Math.hypot(plan.width / 2 - cam.x, plan.length / 2 - cam.y) * 1.55
    const half = ((HALF_FOV[plan.camera?.lens ?? "main"] * Math.PI) / 180)
    const p = (a: number) => `${cam.x + reach * Math.cos(a)} ${cam.y + reach * Math.sin(a)}`
    return `M ${cam.x} ${cam.y} L ${p(aim - half)} L ${p(aim + half)} Z`
  }, [cam, plan.camera?.lens, plan.length, plan.width])

  const label = `${sport.playArea.label} to scale, ${plan.size}. ${plan.marks.join(". ")}.${
    cam ? ` Phone ${placement(plan)}.` : ""
  }`

  return (
    <View style={[styles.wrap, style]}>
      <Reveal from="scale" style={styles.canvas}>
        <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.canvas}>
          <Svg
            viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Playing surface */}
            <Rect x={0} y={0} width={plan.width} height={plan.length} fill={palette.soft} />

            {plan.zones?.map((z, i) => (
              <Rect
                key={`z${i}`}
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                fill={palette.accent}
                fillOpacity={(z.fill ?? 0.4) * 0.3}
              />
            ))}

            {plan.circles?.map((c, i) => (
              <G key={`c${i}`}>
                {c.from === undefined ? (
                  <Circle
                    cx={c.cx}
                    cy={c.cy}
                    r={c.r}
                    fill="none"
                    stroke={palette.ink}
                    strokeWidth={w.line}
                  />
                ) : (
                  <Path
                    d={arcPath(c.cx, c.cy, c.r, c.from, c.to ?? c.from + 180)}
                    fill="none"
                    stroke={palette.ink}
                    strokeWidth={w.faint}
                  />
                )}
              </G>
            ))}

            {plan.lines.map((l, i) =>
              l.net ? (
                <Line
                  key={`l${i}`}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke={palette.deep}
                  strokeWidth={w.boundary * 1.3}
                  strokeDasharray={`${diag * 0.012} ${diag * 0.009}`}
                  strokeLinecap="round"
                />
              ) : (
                <Line
                  key={`l${i}`}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke={palette.ink}
                  strokeWidth={w[l.weight ?? "line"]}
                  strokeOpacity={l.weight === "faint" ? 0.55 : 1}
                  strokeLinecap="square"
                />
              ),
            )}

            {cam && cone ? (
              <G>
                <Path d={cone} fill={palette.accent} fillOpacity={0.14} />
                <Circle cx={cam.x} cy={cam.y} r={dot} fill={palette.accent} />
                <Circle cx={cam.x} cy={cam.y} r={dot * 1.9} fill="none" stroke={palette.accent} strokeWidth={w.faint} />
              </G>
            ) : null}
          </Svg>
        </View>
      </Reveal>

      {cam && plan.camera ? (
        <Reveal index={1} style={styles.legend}>
          <View style={[styles.pin, { backgroundColor: palette.accent }]}>
            <Icon name="record" size={13} color="#FFFFFF" weight={2} />
          </View>
          <Text style={[Type.small, styles.legendText]}>
            Put the phone here — {placement(plan)}.
          </Text>
        </Reveal>
      ) : null}

      <Reveal index={2} style={styles.marks}>
        {plan.marks.map((m) => (
          <View key={m} style={[styles.mark, { backgroundColor: palette.soft }]}>
            <Text style={[styles.markText, { color: palette.onSoft }]} numberOfLines={1}>
              {m}
            </Text>
          </View>
        ))}
      </Reveal>
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: { gap: Space.md },
  canvas: { width: "100%", aspectRatio: 0.86 },
  legend: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  pin: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  legendText: { flex: 1, lineHeight: 19, color: Paper.ink },
  marks: { flexDirection: "row", flexWrap: "wrap", gap: Space.xs },
  mark: { paddingHorizontal: Space.md, paddingVertical: 5, borderRadius: Radius.pill },
  markText: { fontFamily: Fonts.bodyMed, fontSize: 12 },
})
