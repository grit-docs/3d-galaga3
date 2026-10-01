import * as THREE from 'three'
import { glowTexture } from './glow'

export interface BurstOptions {
  speed: number
  life: number
  color: THREE.Color
  /** optional dominant direction (unit) to bias velocities */
  dir?: THREE.Vector3
  dirStrength?: number
}

/**
 * Pooled CPU particle system rendered as a single THREE.Points.
 * Fixed capacity per quality tier; zero per-frame allocations in steady state.
 */
export class Particles {
  readonly points: THREE.Points
  private capacity: number
  private pos: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private maxLife: Float32Array
  private base: Float32Array
  private colorAttr: THREE.BufferAttribute
  private geom: THREE.BufferGeometry
  private mat: THREE.PointsMaterial
  private free: number[] = []
  private tmp = new THREE.Vector3()

  constructor(capacity: number) {
    this.capacity = capacity
    this.pos = new Float32Array(capacity * 3)
    this.vel = new Float32Array(capacity * 3)
    this.life = new Float32Array(capacity)
    this.maxLife = new Float32Array(capacity)
    this.base = new Float32Array(capacity * 3)
    const colors = new Float32Array(capacity * 3)
    for (let i = 0; i < capacity; i++) {
      this.pos[i * 3 + 1] = -9999
      this.free.push(i)
    }
    this.geom = new THREE.BufferGeometry()
    this.colorAttr = new THREE.BufferAttribute(colors, 3)
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geom.setAttribute('color', this.colorAttr)
    this.geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.mat = new THREE.PointsMaterial({
      size: 0.4,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    this.points = new THREE.Points(this.geom, this.mat)
    this.points.frustumCulled = false
  }

  get activeCount(): number {
    return this.capacity - this.free.length
  }

  burst(origin: THREE.Vector3, count: number, opts: BurstOptions): void {
    for (let i = 0; i < count; i++) {
      const idx = this.free.pop()
      if (idx === undefined) return
      const j = idx * 3
      this.pos[j] = origin.x
      this.pos[j + 1] = origin.y
      this.pos[j + 2] = origin.z
      // random unit direction
      const u = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - u * u))
      let dx = r * Math.cos(a)
      let dy = r * Math.sin(a)
      let dz = u
      if (opts.dir) {
        const s = opts.dirStrength ?? 0.5
        dx = dx * (1 - s) + opts.dir.x * s
        dy = dy * (1 - s) + opts.dir.y * s
        dz = dz * (1 - s) + opts.dir.z * s
      }
      const sp = opts.speed * (0.4 + Math.random() * 0.8)
      this.vel[j] = dx * sp
      this.vel[j + 1] = dy * sp
      this.vel[j + 2] = dz * sp
      const life = opts.life * (0.5 + Math.random() * 0.7)
      this.life[idx] = life
      this.maxLife[idx] = life
      this.base[j] = opts.color.r
      this.base[j + 1] = opts.color.g
      this.base[j + 2] = opts.color.b
    }
  }

  update(dt: number): void {
    const dragK = Math.exp(-3 * dt)
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      const j = i * 3
      if (this.life[i] <= 0) {
        this.life[i] = 0
        this.pos[j + 1] = -9999
        this.colorAttr.array[j] = 0
        this.colorAttr.array[j + 1] = 0
        this.colorAttr.array[j + 2] = 0
        this.free.push(i)
        continue
      }
      this.vel[j] *= dragK
      this.vel[j + 1] *= dragK
      this.vel[j + 2] *= dragK
      this.pos[j] += this.vel[j] * dt
      this.pos[j + 1] += this.vel[j + 1] * dt
      this.pos[j + 2] += this.vel[j + 2] * dt
      const fade = this.life[i] / this.maxLife[i]
      this.colorAttr.array[j] = this.base[j] * fade
      this.colorAttr.array[j + 1] = this.base[j + 1] * fade
      this.colorAttr.array[j + 2] = this.base[j + 2] * fade
    }
    this.geom.attributes.position.needsUpdate = true
    this.colorAttr.needsUpdate = true
  }

  dispose(): void {
    this.geom.dispose()
    this.mat.dispose()
  }

  /** convenience: convert a plain {x,y,z} to a Vector3 without allocation churn */
  toVec(x: number, y: number, z: number): THREE.Vector3 {
    this.tmp.set(x, y, z)
    return this.tmp
  }
}
