export class KalmanFilter {
  private q: number
  private r: number
  private p: number
  private x: number
  private k: number

  constructor(processNoise: number = 0.01, measurementNoise: number = 0.1) {
    this.q = processNoise
    this.r = measurementNoise
    this.p = 0
    this.x = 0
    this.k = 0
  }

  filter(measurement: number): number {
    this.p = this.p + this.q
    this.k = this.p / (this.p + this.r)
    this.x = this.x + this.k * (measurement - this.x)
    this.p = (1 - this.k) * this.p
    return this.x
  }

  reset(): void {
    this.p = 0
    this.x = 0
    this.k = 0
  }

  get state(): number {
    return this.x
  }
}

export class KalmanFilter2D {
  private kx: KalmanFilter
  private ky: KalmanFilter

  constructor(processNoise: number = 0.01, measurementNoise: number = 0.1) {
    this.kx = new KalmanFilter(processNoise, measurementNoise)
    this.ky = new KalmanFilter(processNoise, measurementNoise)
  }

  filter(x: number, y: number): { x: number; y: number } {
    return {
      x: this.kx.filter(x),
      y: this.ky.filter(y),
    }
  }

  reset(): void {
    this.kx.reset()
    this.ky.reset()
  }
}
