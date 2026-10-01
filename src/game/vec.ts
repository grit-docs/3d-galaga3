import type { Vec3 } from './types'

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z }
}

export function clone(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z }
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x
  out.y = a.y + b.y
  out.z = a.z + b.z
  return out
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x
  out.y = a.y - b.y
  out.z = a.z - b.z
  return out
}

export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s
  out.y = a.y * s
  out.z = a.z * s
  return out
}

export function len(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
}

export function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function normalize(a: Vec3): Vec3 {
  const l = len(a)
  if (l > 1e-8) {
    a.x /= l
    a.y /= l
    a.z /= l
  } else {
    a.x = 0
    a.y = 0
    a.z = -1
  }
  return a
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** frame-rate independent damping factor */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt)
}
