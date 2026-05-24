interface Point {
  x: number
  y: number
}

export function hipNormalize(keypoints: Point[]): Point[] {
  if (keypoints.length < 24) return keypoints

  const leftHip = keypoints[23]
  const rightHip = keypoints[24]

  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  }

  return keypoints.map((kp) => ({
    x: kp.x - hipCenter.x,
    y: kp.y - hipCenter.y,
  }))
}

export function calculateAngle(a: Point, b: Point, c: Point): number {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }

  const dot = ab.x * cb.x + ab.y * cb.y
  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y)
  const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y)

  if (magAB === 0 || magCB === 0) return 0

  const cosAngle = dot / (magAB * magCB)
  const clamped = Math.max(-1, Math.min(1, cosAngle))
  return (Math.acos(clamped) * 180) / Math.PI
}

export function getJointAngles(keypoints: Point[]): Record<string, number> {
  if (keypoints.length < 33) return {}

  return {
    right_elbow: calculateAngle(keypoints[12], keypoints[14], keypoints[16]),
    left_elbow: calculateAngle(keypoints[11], keypoints[13], keypoints[15]),
    right_shoulder: calculateAngle(keypoints[14], keypoints[12], keypoints[24]),
    left_shoulder: calculateAngle(keypoints[13], keypoints[11], keypoints[23]),
    right_hip: calculateAngle(keypoints[12], keypoints[24], keypoints[26]),
    left_hip: calculateAngle(keypoints[11], keypoints[23], keypoints[25]),
    right_knee: calculateAngle(keypoints[24], keypoints[26], keypoints[28]),
    left_knee: calculateAngle(keypoints[23], keypoints[25], keypoints[27]),
  }
}

export function getJointQuality(
  angle: number,
  benchmark: number,
  tolerance: number = 15,
): "good" | "warning" | "poor" {
  const diff = Math.abs(angle - benchmark)
  if (diff <= tolerance) return "good"
  if (diff <= tolerance * 2) return "warning"
  return "poor"
}

export function calculateWristVelocity(
  prevWrist: Point,
  currWrist: Point,
  fps: number,
  pixelsPerMeter: number,
): number {
  const dx = currWrist.x - prevWrist.x
  const dy = currWrist.y - prevWrist.y
  const displacement = Math.sqrt(dx * dx + dy * dy)
  return (displacement / pixelsPerMeter) * fps
}
