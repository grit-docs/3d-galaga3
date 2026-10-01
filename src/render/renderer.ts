import * as THREE from 'three'
import type { Engine } from '../game/engine'
import type { Enemy, GameEvent } from '../game/types'
import { FREQ_COLORS } from '../game/data/weapons'
import { enemyDef } from '../game/data/enemies'
import { damp, lerp } from '../game/vec'
import { Background } from './background'
import {
  buildBulletVisual,
  buildEnemyVisual,
  buildPlayerShip,
  buildShardVisual,
  disposeSharedGeometries,
  type BulletVisual,
  type EnemyVisual,
  type PlayerVisual,
  type ShardVisual,
} from './meshes'
import { Particles } from './particles'
import { disposeGlowTexture, glowTexture } from './glow'
import { qualitySettings, type Quality, type QualitySettings } from './quality'

const tmpColor = new THREE.Color()

interface LightningFlash {
  line: THREE.Line
  mat: THREE.LineBasicMaterial
  life: number
  maxLife: number
  points: number
}

const MAX_LIGHTNING = 8
const LIGHTNING_POINTS = 8

class LightningPool {
  private items: LightningFlash[] = []
  private group = new THREE.Group()

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
    for (let i = 0; i < MAX_LIGHTNING; i++) {
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LIGHTNING_POINTS * 3), 3))
      geom.setDrawRange(0, 0)
      const mat = new THREE.LineBasicMaterial({
        color: 0xb478ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const line = new THREE.Line(geom, mat)
      line.visible = false
      line.frustumCulled = false
      this.group.add(line)
      this.items.push({ line, mat, life: 0, maxLife: 0.18, points: 0 })
    }
  }

  flash(points: { x: number; y: number; z: number }[]): void {
    const it = this.items.find((x) => x.life <= 0) ?? this.items[0]
    const attr = it.line.geometry.getAttribute('position') as THREE.BufferAttribute
    const n = Math.min(points.length, LIGHTNING_POINTS)
    for (let i = 0; i < n; i++) {
      attr.setXYZ(i, points[i].x, points[i].y, points[i].z)
    }
    it.line.geometry.setDrawRange(0, n)
    it.points = n
    it.life = it.maxLife
    it.line.visible = true
    it.mat.opacity = 1
    it.line.geometry.attributes.position.needsUpdate = true
  }

  update(dt: number): void {
    for (const it of this.items) {
      if (it.life <= 0) continue
      it.life -= dt
      if (it.life <= 0) {
        it.life = 0
        it.line.visible = false
        continue
      }
      it.mat.opacity = it.life / it.maxLife
    }
  }

  dispose(): void {
    for (const it of this.items) {
      it.line.geometry.dispose()
      it.mat.dispose()
    }
    this.group.removeFromParent()
  }
}

/** World-space aim reticle that tracks where the player is aiming. */
class Reticle {
  readonly group = new THREE.Group()
  private ring: THREE.Mesh
  private ticks: THREE.Mesh[]
  private dot: THREE.Sprite
  private mat: THREE.MeshBasicMaterial
  private t = 0

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x4df3ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 24), this.mat)
    this.ticks = []
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.16), this.mat)
      const a = (i / 4) * Math.PI * 2
      tick.position.set(Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0)
      tick.rotation.z = a + Math.PI / 2
      this.ticks.push(tick)
    }
    this.dot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0x9ff5ff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    )
    this.dot.scale.setScalar(0.42)
    this.group.add(this.ring, ...this.ticks, this.dot)
    this.group.visible = false
    this.group.renderOrder = 5
    scene.add(this.group)
  }

  /** Place the reticle at a world position (the aim ray ∩ field plane). */
  show(x: number, y: number, z: number): void {
    this.group.visible = true
    this.group.position.set(x, y, z)
  }

  hide(): void {
    this.group.visible = false
  }

  update(dt: number): void {
    if (!this.group.visible) return
    this.t += dt
    // slow spin + gentle breathing scale
    this.group.rotation.z = this.t * 0.8
    const breathe = 1 + Math.sin(this.t * 4) * 0.08
    this.ring.scale.setScalar(breathe)
  }

  dispose(): void {
    this.ring.geometry.dispose()
    for (const tick of this.ticks) tick.geometry.dispose()
    this.mat.dispose()
    this.dot.material.dispose()
    this.group.removeFromParent()
  }
}

export class Renderer {
  private gl: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private bg = new Background()
  private particles: Particles
  private lightning: LightningPool
  private playerVis: PlayerVisual
  private enemyMap = new Map<number, EnemyVisual>()
  private shardMap = new Map<number, ShardVisual>()
  private shardFree: ShardVisual[] = []
  private bulletFree: BulletVisual[] = []
  private bulletMap = new Map<number, BulletVisual>()
  private camPos = new THREE.Vector3(0, 3, 14)
  private lookTarget = new THREE.Vector3(0, 0, -16)
  private shakeAmp = 0
  private shakeT = 0
  private t = 0
  private reticle: Reticle
  private disposed = false

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    const qs = qualitySettings(quality)
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: qs.antialias, powerPreference: 'high-performance' })
    this.gl.setPixelRatio(qs.pixelRatio)
    if (qs.toneMapping) {
      this.gl.toneMapping = THREE.ACESFilmicToneMapping
      this.gl.toneMappingExposure = 1.1
    }
    this.scene.background = new THREE.Color(0x05070f)
    this.scene.fog = new THREE.Fog(0x05070f, 60, 260)
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600)

    // three-point lighting rig tuned for the neon-on-space look.
    // previously the scene had no lights at all, so MeshStandardMaterial
    // hulls rendered nearly black and only emissive parts were visible.
    const keyLight = new THREE.DirectionalLight(0xf4f8ff, 1.6)
    keyLight.position.set(6, 12, 8)
    const fillLight = new THREE.DirectionalLight(0x4df3ff, 0.7)
    fillLight.position.set(-10, -4, 6)
    const rimLight = new THREE.DirectionalLight(0xff4dd8, 0.9)
    rimLight.position.set(0, 3, -14)
    const ambient = new THREE.AmbientLight(0x334466, 0.9)
    this.scene.add(keyLight, fillLight, rimLight, ambient)

    this.scene.add(this.bg.group)
    this.particles = new Particles(qs.particles)
    this.scene.add(this.particles.points)
    this.lightning = new LightningPool(this.scene)
    this.reticle = new Reticle(this.scene)
    this.playerVis = buildPlayerShip()
    this.playerVis.group.visible = false
    this.scene.add(this.playerVis.group)
    this.bg.setQuality(qs)
    this.resize()
  }

  setQuality(q: Quality): void {
    if (this.disposed) return
    const qs = qualitySettings(q)
    this.gl.setPixelRatio(qs.pixelRatio)
    this.gl.setSize(this.gl.domElement.clientWidth, this.gl.domElement.clientHeight, false)
    if (qs.toneMapping) {
      this.gl.toneMapping = THREE.ACESFilmicToneMapping
    } else {
      this.gl.toneMapping = THREE.NoToneMapping
    }
    // rebuild particle pool
    this.scene.remove(this.particles.points)
    this.particles.dispose()
    this.particles = new Particles(qs.particles)
    this.scene.add(this.particles.points)
    this.bg.setQuality(qs)
  }

  resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.gl.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp)
    this.shakeT = 0.3
  }

  handleEvents(events: GameEvent[]): void {
    const pv = this.particles
    for (const ev of events) {
      switch (ev.type) {
        case 'explosion': {
          const v = pv.toVec(ev.pos.x, ev.pos.y, ev.pos.z)
          tmpColor.set(ev.color)
          pv.burst(v, Math.min(60, Math.floor(ev.size * 16)), { speed: 6 + ev.size * 3, life: 0.7, color: tmpColor })
          if (ev.size > 2) this.shake(0.5)
          break
        }
        case 'enemyHit': {
          const v = pv.toVec(ev.pos.x, ev.pos.y, ev.pos.z)
          tmpColor.set(ev.crit ? '#ffffff' : FREQ_COLORS[ev.freq])
          pv.burst(v, 4, { speed: 5, life: 0.3, color: tmpColor })
          break
        }
        case 'enemyDeath': {
          const v = pv.toVec(ev.pos.x, ev.pos.y, ev.pos.z)
          tmpColor.set('#ffb45e')
          pv.burst(v, ev.big ? 70 : 22, { speed: ev.big ? 14 : 8, life: 0.8, color: tmpColor })
          break
        }
        case 'playerHit':
          this.shake(0.6)
          break
        case 'shardPickup': {
          const v = pv.toVec(ev.pos.x, ev.pos.y, ev.pos.z)
          tmpColor.set(FREQ_COLORS[ev.freq])
          pv.burst(v, 8, { speed: 3, life: 0.4, color: tmpColor })
          break
        }
        case 'weave': {
          const v = pv.toVec(ev.pos.x, ev.pos.y, ev.pos.z)
          tmpColor.set(FREQ_COLORS[ev.freq])
          pv.burst(v, 40, { speed: 9, life: 0.9, color: tmpColor, dir: new THREE.Vector3(0, 0, 0), dirStrength: 0 })
          this.shake(0.25)
          break
        }
        case 'phase':
          this.shake(0.2)
          break
        case 'bomb': {
          const p = this.playerVis.group.position
          tmpColor.set('#ffffff')
          pv.burst(p, 90, { speed: 18, life: 1, color: tmpColor })
          this.shake(0.9)
          break
        }
        case 'lightning':
          this.lightning.flash(ev.points)
          break
        default:
          break
      }
    }
  }

  private syncEnemies(engine: Engine): void {
    const seen = new Set<number>()
    for (const e of engine.enemies) {
      seen.add(e.id)
      let vis = this.enemyMap.get(e.id)
      if (!vis) {
        vis = buildEnemyVisual(enemyDef(e.defId))
        this.scene.add(vis.group)
        this.enemyMap.set(e.id, vis)
      }
      this.updateEnemyVisual(vis, e)
    }
    for (const [id, vis] of this.enemyMap) {
      if (!seen.has(id)) {
        this.scene.remove(vis.group)
        this.enemyMap.delete(id)
      }
    }
  }

  private updateEnemyVisual(vis: EnemyVisual, e: Enemy): void {
    const g = vis.group
    g.position.set(e.pos.x, e.pos.y, e.pos.z)
    let s = 1
    if (e.state === 'spawn') {
      const k = 1 - e.stateTimer / 0.5
      s = lerp(0.25, 1, Math.max(0, Math.min(1, k)))
    } else if (e.state === 'dying') {
      s = Math.max(0, e.stateTimer / 0.25)
    }
    g.scale.setScalar(Math.max(0.001, s))
    // per-type idle animations authored at build time
    for (const anim of vis.idleAnims ?? []) anim(this.t, e.phase)
    // engine exhausts breathe with thrust
    const eng = vis.engines
    if (eng) {
      for (let i = 0; i < eng.length; i++) {
        const sp = eng[i]
        const base = sp.scale.x
        sp.scale.setScalar(base * (1 + Math.sin(this.t * 9 + e.phase * 2 + i * 1.7) * 0.22))
      }
    }
    // hit flash — overrides emissive, then restores each material's own base
    for (const m of vis.flashMats) {
      if (e.hitFlash > 0) {
        m.emissiveIntensity = 0.9 + (e.hitFlash / 0.12) * 1.6
      } else if (e.hitFlash === 0 && m.userData.baseIntensity !== undefined) {
        m.emissiveIntensity = m.userData.baseIntensity
      }
    }
    if (vis.shieldMat) {
      const frac = e.maxShield > 0 ? e.shield / e.maxShield : 0
      vis.shieldMat.opacity = 0.08 + frac * 0.22
      vis.shieldMat.color.set(frac > 0 ? 0x4df3ff : 0x2a4a5a)
    }
    // face player (models are authored with forward = -Z, lookAt aims +Z)
    g.lookAt(this.playerVis.group.position.x, this.playerVis.group.position.y, this.playerVis.group.position.z)
    g.rotateY(Math.PI)
  }

  private syncShards(engine: Engine): void {
    const seen = new Set<number>()
    for (const s of engine.shards) {
      seen.add(s.id)
      let vis = this.shardMap.get(s.id)
      if (!vis) {
        if (this.shardFree.length > 0) {
          vis = this.shardFree.pop()!
        } else {
          vis = buildShardVisual()
          this.scene.add(vis.group)
        }
        this.shardMap.set(s.id, vis)
      }
      vis.group.visible = true
      vis.group.position.set(s.pos.x, s.pos.y, s.pos.z)
      vis.mat.color.set(FREQ_COLORS[s.freq])
      const glow = vis.group.children[1] as THREE.Sprite
      glow.material.color.set(FREQ_COLORS[s.freq])
      vis.spin += 0.08
      vis.group.rotation.y = vis.spin
      vis.group.rotation.x = vis.spin * 0.7
    }
    for (const [id, vis] of this.shardMap) {
      if (!seen.has(id)) {
        vis.group.visible = false
        this.scene.remove(vis.group)
        this.shardMap.delete(id)
        this.shardFree.push(vis)
      }
    }
  }

  private syncBullets(engine: Engine): void {
    const seen = new Set<number>()
    for (const b of engine.bullets) {
      seen.add(b.id)
      let vis = this.bulletMap.get(b.id)
      if (!vis) {
        if (this.bulletFree.length > 0) {
          vis = this.bulletFree.pop()!
        } else {
          vis = buildBulletVisual()
          this.scene.add(vis.group)
        }
        this.bulletMap.set(b.id, vis)
      }
      vis.group.visible = true
      vis.group.position.set(b.pos.x, b.pos.y, b.pos.z)
      const scale = b.radius * (b.friendly ? 1 : 1.15)
      ;(vis.group.children[0] as THREE.Mesh).scale.setScalar(scale)
      const col = b.friendly ? FREQ_COLORS[b.freq] : '#ff7a4d'
      vis.mat.color.set(col)
      ;(vis.glow.material as THREE.SpriteMaterial).color.set(col)
      vis.glow.scale.setScalar(scale * 5)
    }
    for (const [id, vis] of this.bulletMap) {
      if (!seen.has(id)) {
        vis.group.visible = false
        this.bulletMap.delete(id)
        this.bulletFree.push(vis)
      }
    }
  }

  private syncPlayer(engine: Engine, dt: number): void {
    const p = engine.player
    const pv = this.playerVis
    const active = engine.state === 'playing' || engine.state === 'upgrade'
    pv.group.visible = active && !p.dead
    if (!pv.group.visible) {
      this.reticle.hide()
      return
    }
    pv.group.position.set(p.pos.x, p.pos.y, p.pos.z)
    const aim = engine.input.aim
    const dir = new THREE.Vector3(aim.x, aim.y, aim.z).normalize()
    // aim reticle floats ahead of the ship along the aim ray
    const rd = 16
    this.reticle.show(p.pos.x + aim.x * rd, p.pos.y + aim.y * rd, p.pos.z + aim.z * rd)
    this.reticle.update(dt)
    pv.turret.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir)
    const speed = Math.hypot(p.vel.x, p.vel.y)
    pv.group.rotation.z = lerp(pv.group.rotation.z, -p.vel.x * 0.012, damp(6, dt))
    pv.group.rotation.x = lerp(pv.group.rotation.x, p.vel.y * 0.006, damp(6, dt))
    // invulnerability blink
    pv.group.visible = p.invuln > 0 ? Math.sin(this.t * 40) > -0.4 : true
    // engine glow pulse with speed
    const glowScale = 0.8 + speed * 0.04 + Math.sin(this.t * 30) * 0.08
    pv.engineGlow.scale.setScalar(Math.max(0.4, glowScale))
  }

  frame(engine: Engine, dt: number): void {
    if (this.disposed) return
    this.t += dt
    this.syncPlayer(engine, dt)
    this.syncEnemies(engine)
    this.syncShards(engine)
    this.syncBullets(engine)
    this.particles.update(dt)
    this.lightning.update(dt)
    // wave progress drives the nebula palette drift (teal -> magenta)
    const waveProgress = engine.waveIndex >= 0 ? Math.min(1, engine.waveIndex / 8) : 0
    this.bg.setProgress(waveProgress)
    this.bg.update(dt, engine.player.pos)

    // camera
    const p = engine.player
    if (engine.state === 'menu') {
      this.camPos.lerp(new THREE.Vector3(Math.sin(this.t * 0.1) * 8, 5 + Math.sin(this.t * 0.07) * 2, 16), damp(1.5, dt))
      this.lookTarget.lerp(new THREE.Vector3(0, 0, -24), damp(1.5, dt))
    } else {
      const speed = Math.hypot(p.vel.x, p.vel.y)
      const target = new THREE.Vector3(p.pos.x * 0.85, p.pos.y * 0.85 + 2.6, 9.2)
      this.camPos.lerp(target, damp(5, dt))
      this.lookTarget.lerp(new THREE.Vector3(p.pos.x * 0.5, p.pos.y * 0.5, -16), damp(5, dt))
      const targetFov = 62 + (p.phaseActive > 0 ? 10 : 0) + Math.min(6, speed * 0.28)
      this.camera.fov = lerp(this.camera.fov, targetFov, damp(6, dt))
      this.camera.updateProjectionMatrix()
    }
    this.camera.position.copy(this.camPos)
    // shake
    if (this.shakeT > 0) {
      this.shakeT -= dt
      const k = Math.max(0, this.shakeT / 0.3) * this.shakeAmp
      this.camera.position.x += (Math.random() * 2 - 1) * k
      this.camera.position.y += (Math.random() * 2 - 1) * k
      this.shakeAmp = Math.max(0, this.shakeAmp - dt * 2)
    }
    this.camera.lookAt(this.lookTarget)
    this.gl.render(this.scene, this.camera)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.lightning.dispose()
    this.reticle.dispose()
    this.particles.dispose()
    this.bg.dispose()
    // materials are unique per visual; geometries live in the shared cache
    this.disposeMaterials(this.playerVis.group)
    for (const vis of this.enemyMap.values()) this.disposeMaterials(vis.group)
    for (const vis of this.shardMap.values()) this.disposeMaterials(vis.group)
    for (const vis of this.shardFree) this.disposeMaterials(vis.group)
    for (const vis of this.bulletFree) this.disposeMaterials(vis.group)
    for (const vis of this.bulletMap.values()) this.disposeMaterials(vis.group)
    disposeSharedGeometries()
    disposeGlowTexture()
    this.gl.dispose()
  }

  private disposeMaterials(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
  }
}

export type { Quality, QualitySettings }
