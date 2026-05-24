import { useCallback, useRef } from "react"
import { useSessionStore } from "../store/sessionStore"
import { KalmanFilter2D } from "../lib/kalman"
import { calculateSpeed, estimatePixelsPerMeter, getSpeedColor } from "../lib/speedCalc"
import { getJointAngles, getJointQuality } from "../lib/normalization"
import type { FrameResult, StrokeEvent, StrokeType } from "../types"

const STROKE_TYPES: StrokeType[] = ["smash", "drop", "clear", "net", "serve", "defensive", "drive"]
const ROLLING_WINDOW_SIZE = 30

export function useSessionAnalysis() {
  const {
    addFrameResult,
    addStrokeEvent,
    setCurrentSpeed,
    updateMaxSpeed,
    updateHudData,
    courtCalibrated,
    pixelsPerMeter,
  } = useSessionStore()

  const kalmanX = useRef(new KalmanFilter2D(0.02, 0.15)).current
  const rollingKeypoints = useRef<number[][][]>([])
  const prevPosition = useRef<{ x: number; y: number } | null>(null)
  const frameCount = useRef(0)
  const trail = useRef<{ x: number; y: number; opacity: number }[]>([])
  const fps = useRef(30)

  const analyzeFrame = useCallback(
    (frameData: {
      frameWidth: number
      frameHeight: number
      shuttleX?: number
      shuttleY?: number
      shuttleConfidence?: number
      keypoints?: number[][]
      fps?: number
    }) => {
      const {
        frameWidth,
        frameHeight,
        shuttleX,
        shuttleY,
        shuttleConfidence = 0,
        keypoints,
        fps: frameFps,
      } = frameData

      if (frameFps) fps.current = frameFps
      frameCount.current++

      const detected = shuttleX !== undefined && shuttleY !== undefined && shuttleConfidence > 0.3
      let speedKmh: number | null = null
      let filteredX: number | undefined
      let filteredY: number | undefined
      let strokeEvent: StrokeEvent | null = null
      let jointAngles: Record<string, number> | null = null
      let jointQualities: Record<string, "good" | "warning" | "poor"> | null = null

      // Shuttle detection
      if (detected && shuttleX !== undefined && shuttleY !== undefined) {
        const filtered = kalmanX.filter(shuttleX, shuttleY)
        filteredX = filtered.x
        filteredY = filtered.y

        if (prevPosition.current) {
          const ppm = courtCalibrated
            ? pixelsPerMeter
            : estimatePixelsPerMeter(frameWidth, frameHeight)

          speedKmh = calculateSpeed(
            prevPosition.current.x,
            prevPosition.current.y,
            filtered.x,
            filtered.y,
            frameWidth * 0.65,
            fps.current,
          )
        }

        prevPosition.current = { x: filtered.x, y: filtered.y }

        // Trail
        trail.current.push({ x: filtered.x, y: filtered.y, opacity: 1 })
        if (trail.current.length > 10) trail.current.shift()
        trail.current = trail.current.map((t, i) => ({
          ...t,
          opacity: (i + 1) / trail.current.length * 0.6,
        }))
      }

      // Pose analysis
      if (keypoints && keypoints.length >= 33) {
        jointAngles = getJointAngles(
          keypoints.map((kp) => ({ x: kp[0], y: kp[1] })),
        )

        jointQualities = {}
        const benchmarks: Record<string, number> = {
          right_elbow: 160,
          right_knee: 140,
          right_shoulder: 90,
        }
        for (const [joint, angle] of Object.entries(jointAngles)) {
          if (benchmarks[joint]) {
            jointQualities[joint] = getJointQuality(angle, benchmarks[joint])
          }
        }

        // Rolling window for stroke classification
        rollingKeypoints.current.push(keypoints)
        if (rollingKeypoints.current.length > ROLLING_WINDOW_SIZE) {
          rollingKeypoints.current.shift()
        }
      }

      // Simulated stroke detection (in production, BiLSTM would classify)
      if (detected && speedKmh !== null && speedKmh > 40 && frameCount.current % 45 === 0) {
        const stroke: StrokeType = speedKmh > 250
          ? "smash"
          : speedKmh > 180
            ? "clear"
            : speedKmh > 100
              ? "drop"
              : "net"

        strokeEvent = {
          frame_start: frameCount.current - 5,
          frame_peak: frameCount.current,
          frame_end: frameCount.current + 5,
          stroke_type: stroke,
          confidence: 0.75 + Math.random() * 0.2,
          speed_kmh: speedKmh,
          elbow_angle: jointAngles?.right_elbow || 160,
          wrist_velocity: 8 + Math.random() * 5,
          court_x: 3 + Math.random() * 7,
          court_y: 3 + Math.random() * 7,
          angle_at_contact: 30 + Math.random() * 60,
        }

        addStrokeEvent(strokeEvent)
        updateHudData({ current_stroke: stroke })
      }

      // Update speed state
      if (speedKmh !== null) {
        setCurrentSpeed(speedKmh)
        updateMaxSpeed(speedKmh)
      }

      // Update HUD
      updateHudData({
        shuttle_pos: filteredX !== undefined
          ? { x: filteredX, y: filteredY! }
          : null,
        shuttle_trail: [...trail.current],
        speed_kmh: speedKmh,
        keypoints: keypoints || null,
        joint_qualities: jointQualities,
        current_stroke: strokeEvent?.stroke_type || null,
      })

      // Build frame result
      const result: FrameResult = {
        frame_idx: frameCount.current,
        timestamp_s: frameCount.current / fps.current,
        shuttle_detected: detected,
        shuttle_pos_x_px: filteredX || null,
        shuttle_pos_y_px: filteredY || null,
        shuttle_speed_kmh: speedKmh,
        confidence: shuttleConfidence,
        keypoints: keypoints || null,
        joint_angles: jointAngles,
        stroke_event: strokeEvent,
      }

      addFrameResult(result)
      return result
    },
    [addFrameResult, addStrokeEvent, setCurrentSpeed, updateMaxSpeed, updateHudData, courtCalibrated, pixelsPerMeter],
  )

  const resetAnalysis = useCallback(() => {
    kalmanX.reset()
    rollingKeypoints.current = []
    prevPosition.current = null
    frameCount.current = 0
    trail.current = []
  }, [])

  return { analyzeFrame, resetAnalysis }
}
