import { useEffect, useState } from "react"

/**
 * Seam for on-device model warm-up (shuttle detector, pose, stroke classifier via
 * react-native-fast-tflite). Simulated until the models ship inside the app.
 */
export function useMLModels() {
  const [state, setState] = useState({ isReady: false, loadTimeMs: 0 })

  useEffect(() => {
    const start = Date.now()
    const timer = setTimeout(() => setState({ isReady: true, loadTimeMs: Date.now() - start }), 400)
    return () => clearTimeout(timer)
  }, [])

  return state
}
