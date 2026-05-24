import { useState, useEffect, useRef } from "react"

export interface MLModels {
  shuttleModel: unknown
  strokeModel: unknown
  poseModel: unknown
  isReady: boolean
  loadTimeMs: number
}

export function useMLModels(): MLModels {
  const [isReady, setIsReady] = useState(false)
  const [loadTimeMs, setLoadTimeMs] = useState(0)
  const modelsRef = useRef<MLModels>({
    shuttleModel: null,
    strokeModel: null,
    poseModel: null,
    isReady: false,
    loadTimeMs: 0,
  })

  useEffect(() => {
    const startTime = Date.now()

    const loadModels = async () => {
      try {
        // Models are loaded from assets in production via react-native-fast-tflite
        // For now, we simulate the loading state and mark as ready
        // In production, this would use TFLiteModule.loadModel() for each model

        const simulateLoad = async (name: string, delay: number) => {
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              if (__DEV__) console.log(`[ML] Loaded ${name} in ${Date.now() - startTime}ms`)
              resolve()
            }, delay)
          })
        }

        await Promise.all([
          simulateLoad("yolov8n_shuttle.tflite", 400),
          simulateLoad("bilstm_stroke.tflite", 300),
          simulateLoad("mediapipe_pose_lite", 200),
        ])

        const endTime = Date.now()
        const loadTime = endTime - startTime

        modelsRef.current = {
          shuttleModel: { loaded: true },
          strokeModel: { loaded: true },
          poseModel: { loaded: true },
          isReady: true,
          loadTimeMs: loadTime,
        }

        setLoadTimeMs(loadTime)
        setIsReady(true)

        if (__DEV__) console.log(`[ML] All models loaded in ${loadTime}ms`)
      } catch (error) {
        console.error("[ML] Failed to load models:", error)
        modelsRef.current = {
          shuttleModel: null,
          strokeModel: null,
          poseModel: null,
          isReady: false,
          loadTimeMs: 0,
        }
        setIsReady(false)
      }
    }

    loadModels()
  }, [])

  return modelsRef.current
}
