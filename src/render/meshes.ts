import * as THREE from 'three'
import type { EnemyDef } from '../game/types'
import { glowTexture } from './glow'

export interface EnemyVisual {
  group: THREE.Group
  /** materials whose color/emissive gets flashed on hit */
  flashMats: THREE.MeshStandardMaterial[]
  shieldMat: THREE.MeshBasicMaterial | null
  spin: THREE.Group | null
  def: EnemyDef
  /** per-type idle animation, driven by the renderer with elapsed time */
  idleAnims?: ((t: number, phase: number) => void)[]
  /** sprites pulsing as engine thrust (scaled by the renderer) */
  engines?: THREE.Sprite[]
  /** the boss "iris" eye — its emissive pulses with aggro */
  eyeMat?: THREE.MeshStandardMaterial | null
}

export interface BulletVisual {
  group: THREE.Group
  mat: THREE.MeshBasicMaterial
  glow: THREE.Sprite
  inUse: boolean
}

export interface ShardVisual {
  group: THREE.Group
  mat: THREE.MeshBasicMaterial
  spin: number
}

export interface PlayerVisual {
  group: THREE.Group
  turret: THREE.Group
  engineGlow: THREE.Sprite
  bodyMats: THREE.MeshStandardMaterial[]
}

const geoCache = new Map<string, THREE.BufferGeometry>()

function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g
}

export function disposeSharedGeometries(): void {
  for (const g of geoCache.values()) g.dispose()
  geoCache.clear()
}

function stdMat(color: number, emissive: number, emissiveIntensity = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    metalness: 0.45,
    roughness: 0.4,
  })
}

/** Machined armour plating — higher metalness, tighter roughness than stdMat. */
function hullMat(color: number, emissive: number, emissiveIntensity = 0.4): THREE.MeshStandardMaterial {
  const m = stdMat(color, emissive, emissiveIntensity)
  m.metalness = 0.62
  m.roughness = 0.34
  return m
}

/** Faceted geometry: pulls every vertex onto a unit sphere of the given radius. */
function faceted(geo: THREE.BufferGeometry, radius: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
    const len = v.length()
    if (len > 0.0001) v.multiplyScalar(radius / len)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** Angular low-poly "chipped gem" sphere. */
function chipGeo(key: string, radius: number): THREE.BufferGeometry {
  return cachedGeo(key, () => faceted(new THREE.IcosahedronGeometry(radius, 1), radius))
}

/** Cone spike oriented so its +y axis points along the given direction. */
function spike(
  key: string,
  r: number,
  h: number,
  mat: THREE.MeshStandardMaterial,
  ax: number,
  ay: number,
  az: number,
  offset = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(cachedGeo(key, () => new THREE.ConeGeometry(r, h, 5)), mat)
  const dir = new THREE.Vector3(ax, ay, az).normalize()
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  m.position.set(dir.x * offset, dir.y * offset, dir.z * offset)
  return m
}

function glowSprite(color: THREE.ColorRepresentation, scale: number, opacity = 0.7): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  s.scale.setScalar(scale)
  return s
}

/** Engine exhaust sprite placed at a local position (renderer pulses its scale). */
function engineGlow(color: number, x: number, y: number, z: number, scale: number, opacity = 0.75): THREE.Sprite {
  const s = glowSprite(color, scale, opacity)
  s.position.set(x, y, z)
  return s
}

// ---------------------------------------------------------------- player

export function buildPlayerShip(): PlayerVisual {
  const group = new THREE.Group()
  const bodyMat = stdMat(0x24385c, 0x4df3ff, 0.22)
  const accentMat = stdMat(0x8fe9ff, 0x4df3ff, 1.7)
  const darkMat = stdMat(0x0e1626, 0x2a4a6a, 0.35)
  const trimMat = stdMat(0xd9e8ff, 0x7fb8e8, 0.5)

  // diamond-cross-section fuselage, nose at -Z
  const hull = new THREE.Mesh(cachedGeo('pl-hull', () => new THREE.OctahedronGeometry(1, 0)), bodyMat)
  hull.scale.set(0.36, 0.3, 1.6)

  // spine fairing behind the canopy
  const spine = new THREE.Mesh(cachedGeo('pl-spine', () => new THREE.BoxGeometry(0.1, 0.12, 1.05)), darkMat)
  spine.position.set(0, 0.2, 0.35)

  // cockpit canopy
  const canopy = new THREE.Mesh(cachedGeo('pl-canopy', () => new THREE.SphereGeometry(0.13, 12, 10)), accentMat)
  canopy.scale.set(0.9, 0.75, 1.9)
  canopy.position.set(0, 0.17, -0.52)

  // swept wings with dihedral
  const wingGeo = cachedGeo('pl-wing', () => new THREE.BoxGeometry(1.0, 0.06, 0.46))
  const wingL = new THREE.Mesh(wingGeo, bodyMat)
  wingL.position.set(-0.62, 0.02, 0.3)
  wingL.rotation.y = 0.4
  wingL.rotation.z = 0.12
  const wingR = new THREE.Mesh(wingGeo, bodyMat)
  wingR.position.set(0.62, 0.02, 0.3)
  wingR.rotation.y = -0.4
  wingR.rotation.z = -0.12

  // glowing wingtip rails
  const tipGeo = cachedGeo('pl-tip', () => new THREE.BoxGeometry(0.1, 0.1, 0.34))
  const tipL = new THREE.Mesh(tipGeo, accentMat)
  tipL.position.set(-1.16, 0.16, 0.56)
  const tipR = new THREE.Mesh(tipGeo, accentMat)
  tipR.position.set(1.16, 0.16, 0.56)

  // tail stripe on the trailing edge
  const stripe = new THREE.Mesh(cachedGeo('pl-stripe', () => new THREE.BoxGeometry(0.62, 0.03, 0.1)), trimMat)
  stripe.position.set(0, 0.05, 0.62)

  // vertical stabilizer
  const fin = new THREE.Mesh(cachedGeo('pl-fin', () => new THREE.BoxGeometry(0.06, 0.44, 0.5)), darkMat)
  fin.position.set(0, 0.32, 0.5)
  fin.rotation.x = -0.15
  const finEdge = new THREE.Mesh(cachedGeo('pl-finEdge', () => new THREE.BoxGeometry(0.07, 0.06, 0.5)), accentMat)
  finEdge.position.set(0, 0.52, 0.44)
  finEdge.rotation.x = -0.15

  // twin engine nacelles with glowing nozzle rings
  const nacGeo = cachedGeo('pl-nac', () => new THREE.CylinderGeometry(0.09, 0.12, 0.5, 8))
  const nozGeo = cachedGeo('pl-noz', () => new THREE.TorusGeometry(0.1, 0.035, 8, 14))
  for (const side of [-1, 1]) {
    const nac = new THREE.Mesh(nacGeo, darkMat)
    nac.rotation.x = Math.PI / 2
    nac.position.set(side * 0.3, -0.03, 1.2)
    const noz = new THREE.Mesh(nozGeo, accentMat)
    noz.position.set(side * 0.3, -0.03, 1.46)
    group.add(nac, noz)
  }

  // turret: housing + twin barrels, aimed by the renderer
  const turret = new THREE.Group()
  turret.position.set(0, 0.1, -0.2)
  const housing = new THREE.Mesh(cachedGeo('pl-housing', () => new THREE.BoxGeometry(0.32, 0.22, 0.4)), darkMat)
  const barrelGeo = cachedGeo('pl-barrel', () => new THREE.CylinderGeometry(0.045, 0.05, 0.95, 8))
  const muzzleGeo = cachedGeo('pl-muzzle', () => new THREE.TorusGeometry(0.05, 0.02, 6, 10))
  for (const side of [-1, 1]) {
    const barrel = new THREE.Mesh(barrelGeo, darkMat)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(side * 0.08, 0, -0.55)
    const muzzle = new THREE.Mesh(muzzleGeo, accentMat)
    muzzle.position.set(side * 0.08, 0, -1.02)
    turret.add(barrel, muzzle)
  }
  turret.add(housing)

  const engineGlow = glowSprite(0x4df3ff, 1.2, 0.9)
  engineGlow.position.set(0, -0.03, 1.62)
  const wingGlowL = glowSprite(0x4df3ff, 0.5, 0.55)
  wingGlowL.position.set(-1.16, 0.16, 0.62)
  const wingGlowR = glowSprite(0x4df3ff, 0.5, 0.55)
  wingGlowR.position.set(1.16, 0.16, 0.62)

  // soft underglow so the hull reads against dark space
  const underglow = new THREE.PointLight(0x4df3ff, 10, 0, 2)
  underglow.position.set(0, 0.4, -0.4)

  group.add(
    hull,
    spine,
    canopy,
    wingL,
    wingR,
    tipL,
    tipR,
    stripe,
    fin,
    finEdge,
    turret,
    engineGlow,
    wingGlowL,
    wingGlowR,
    underglow,
  )
  return { group, turret, engineGlow, bodyMats: [bodyMat, accentMat, darkMat] }
}

// ---------------------------------------------------------------- enemies

export function buildEnemyVisual(def: EnemyDef): EnemyVisual {
  const group = new THREE.Group()
  const flashMats: THREE.MeshStandardMaterial[] = []
  const idleAnims: ((t: number, phase: number) => void)[] = []
  const engines: THREE.Sprite[] = []
  let shieldMat: THREE.MeshBasicMaterial | null = null
  let spin: THREE.Group | null = null
  let eyeMat: THREE.MeshStandardMaterial | null = null
  let color = 0xff7a4d

  const addMat = (m: THREE.MeshStandardMaterial) => {
    flashMats.push(m)
    return m
  }

  switch (def.id) {
    case 'mite': {
      // ---- mite: swarming tick — faceted core, 8 twin-rail spikes, rear glow
      color = 0xff7a4d
      const m = addMat(hullMat(0x2c1408, 0xff5a2a, 0.7))
      const core = new THREE.Mesh(chipGeo('miteCore', 0.3), m)
      // dark band ring around the equator
      const band = new THREE.Mesh(
        cachedGeo('miteBand', () => new THREE.TorusGeometry(0.32, 0.045, 6, 18)),
        addMat(stdMat(0x140602, 0xff8a4a, 1.1)),
      )
      band.rotation.x = Math.PI / 2
      const spikeMat = addMat(stdMat(0x1a0a04, 0xff8a4a, 1.0))
      const tipMat = addMat(stdMat(0xff8a3a, 0xffa050, 1.6))
      const dirs: [number, number, number][] = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0.8, 0.8, 0],
        [-0.8, -0.8, 0],
        [0, 0.8, 0.8],
        [0, -0.8, -0.8],
      ]
      dirs.forEach((d, i) => {
        group.add(spike(`miteSpike-${i % 8}`, 0.06, 0.3, spikeMat, d[0], d[1], d[2], 0.36))
        group.add(spike(`miteTip-${i % 8}`, 0.03, 0.16, tipMat, d[0], d[1], d[2], 0.58))
      })
      const tail = engineGlow(0xff7a3d, 0, 0, 0.5, 0.6, 0.6)
      engines.push(tail)
      spin = new THREE.Group()
      spin.add(core, band)
      group.add(spin, tail, glowSprite(color, 1.2, 0.5))
      idleAnims.push((t) => {
        if (spin) spin.rotation.y = t * 2.1
        if (spin) spin.rotation.x = Math.sin(t * 3.1) * 0.35
      })
      break
    }
    case 'husk': {
      // ---- husk: jagged bomb — chipped shell, hazard ring, pulsing doom core
      color = 0xff9a3d
      const m = addMat(hullMat(0x2c1a08, color, 0.55))
      const shell = new THREE.Mesh(chipGeo('huskShell', 0.56), m)
      const wireMat = addMat(stdMat(0x000000, color, 2.0))
      wireMat.wireframe = true
      const wire = new THREE.Mesh(chipGeo('huskWire', 0.6), wireMat)
      const core = new THREE.Mesh(
        cachedGeo('huskCore', () => new THREE.SphereGeometry(0.18, 10, 8)),
        addMat(stdMat(0x000000, color, 2.4)),
      )
      // hazard collar: 4 small cones like a naval mine
      const studMat = addMat(stdMat(0x1a0e04, 0xffb060, 0.9))
      const studDirs: [number, number, number][] = [
        [1, 0.4, 0],
        [-1, 0.4, 0],
        [0, -1, 0.4],
        [0, 1, -0.4],
      ]
      studDirs.forEach((d, i) => {
        group.add(spike(`huskStud-${i}`, 0.09, 0.22, studMat, d[0], d[1], d[2], 0.52))
      })
      spin = new THREE.Group()
      spin.add(shell, wire, core)
      group.add(spin, glowSprite(color, 1.5, 0.65))
      idleAnims.push((t) => {
        if (spin) spin.rotation.y = t * 0.9
        if (spin) spin.rotation.z = t * 0.55
        // doom core breathes — about to pop
        core.scale.setScalar(1 + Math.sin(t * 6) * 0.25)
      })
      break
    }
    case 'lance': {
      // ---- lance: sniper arrow — long needle nose, folded cruciform fins, hot tail
      color = 0xb478ff
      const m = addMat(hullMat(0x241238, color, 0.6))
      const body = new THREE.Mesh(cachedGeo('lance', () => new THREE.BoxGeometry(0.26, 0.26, 1.5)), m)
      const needle = new THREE.Mesh(
        cachedGeo('lanceTip', () => new THREE.ConeGeometry(0.13, 1.0, 4)),
        addMat(stdMat(color, color, 1.5)),
      )
      needle.rotation.x = -Math.PI / 2
      needle.rotation.z = Math.PI / 4
      needle.position.z = -1.22
      // dorsal/ventral fins + swept side fins (cruciform)
      const finMat = addMat(stdMat(0x160a24, color, 0.5))
      const finSide = cachedGeo('lanceFinSide', () => new THREE.BoxGeometry(0.8, 0.04, 0.36))
      const finVert = cachedGeo('lanceFinVert', () => new THREE.BoxGeometry(0.04, 0.8, 0.36))
      for (const side of [-1, 1]) {
        const f = new THREE.Mesh(finSide, finMat)
        f.position.set(side * 0.36, 0, 0.34)
        f.rotation.y = side * 0.28
        group.add(f)
        const fv = new THREE.Mesh(finVert, finMat)
        fv.position.set(0, side * 0.36, 0.34)
        fv.rotation.x = -side * 0.28
        group.add(fv)
      }
      // twin hot engine bells
      const thrGeo = cachedGeo('lanceThr', () => new THREE.CylinderGeometry(0.07, 0.1, 0.2, 8))
      const thrMat = addMat(stdMat(0x120818, 0x8a4aff, 0.8))
      const tailA = engineGlow(color, -0.11, 0, 0.92, 0.55, 0.6)
      const tailB = engineGlow(color, 0.11, 0, 0.92, 0.55, 0.6)
      engines.push(tailA, tailB)
      for (const side of [-1, 1]) {
        const thr = new THREE.Mesh(thrGeo, thrMat)
        thr.rotation.x = Math.PI / 2
        thr.position.set(side * 0.11, 0, 0.8)
        group.add(thr)
      }
      group.add(body, needle, tailA, tailB)
      idleAnims.push((t, ph) => {
        // charge shimmer on the needle before it fires
        needle.material.emissiveIntensity = 1.5 + Math.sin(t * 7 + ph * 3) * 0.8
      })
      break
    }
    case 'weaver': {
      // ---- weaver: gyroscope — inner gimbal + outer gimbal + blazing core
      color = 0xff4dd8
      const gimbalA = new THREE.Group()
      const gimbalB = new THREE.Group()
      const ring1 = new THREE.Mesh(
        cachedGeo('weaver', () => new THREE.TorusGeometry(0.5, 0.06, 8, 24)),
        addMat(hullMat(0x2c0c24, color, 0.9)),
      )
      const ring2 = new THREE.Mesh(
        cachedGeo('weaverRing2', () => new THREE.TorusGeometry(0.72, 0.045, 8, 28)),
        addMat(stdMat(0x1c0818, color, 1.2)),
      )
      ring2.rotation.x = Math.PI / 2
      gimbalA.add(ring1)
      gimbalB.add(ring2)
      // pods ride the outer gimbal
      const podGeo = cachedGeo('weaverPod', () => new THREE.OctahedronGeometry(0.1))
      const podMat = addMat(stdMat(color, color, 1.4))
      const podL = new THREE.Mesh(podGeo, podMat)
      podL.position.set(-0.52, 0, 0)
      const podR = new THREE.Mesh(podGeo, podMat)
      podR.position.set(0.52, 0, 0)
      gimbalB.add(podL, podR)
      const core = new THREE.Mesh(
        cachedGeo('weaverCore', () => new THREE.SphereGeometry(0.2, 12, 10)),
        addMat(stdMat(color, color, 2.0)),
      )
      spin = new THREE.Group()
      spin.add(gimbalA, gimbalB, core)
      group.add(spin, glowSprite(color, 1.3, 0.5))
      idleAnims.push((t) => {
        gimbalA.rotation.x = t * 2.4
        gimbalB.rotation.y = t * 3.2
        core.scale.setScalar(1 + Math.sin(t * 5) * 0.2)
      })
      break
    }
    case 'wraith': {
      // ---- wraith: phase ghost — 3 nested translucent shells + shard halo
      color = 0xe07aff
      const shellMats: THREE.MeshStandardMaterial[] = []
      for (let i = 0; i < 3; i++) {
        const sm = addMat(stdMat(0x1e0c2c, color, 1.1 - i * 0.15))
        sm.transparent = true
        sm.opacity = 0.5 - i * 0.12
        sm.depthWrite = false
        shellMats.push(sm)
        const shell = new THREE.Mesh(
          cachedGeo(`wraithShell${i}`, () => faceted(new THREE.IcosahedronGeometry(0.62 - i * 0.14, 0), 0.62 - i * 0.14)),
          sm,
        )
        group.add(shell)
        // counter-rotating shells via idle anim
        idleAnims.push((t) => {
          shell.rotation.y = t * (0.6 + i * 0.5) * (i % 2 === 0 ? 1 : -1)
          shell.rotation.x = t * 0.3 * (i % 2 === 0 ? 1 : -1)
        })
      }
      const coreMat = addMat(stdMat(color, color, 2.2))
      coreMat.transparent = true
      coreMat.opacity = 0.9
      const core = new THREE.Mesh(cachedGeo('wraithCore', () => new THREE.OctahedronGeometry(0.2)), coreMat)
      const shardGeo = cachedGeo('wraithShard', () => new THREE.OctahedronGeometry(0.09))
      const shardMat = addMat(stdMat(0x12081c, color, 1.5))
      const halo = new THREE.Group()
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const shard = new THREE.Mesh(shardGeo, shardMat)
        shard.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0)
        halo.add(shard)
      }
      spin = halo
      group.add(core, spin, glowSprite(color, 1.9, 0.45))
      idleAnims.push((t) => {
        // halo tilts and precesses like a gyroscope ring
        halo.rotation.x = Math.sin(t * 1.3) * 0.7
        halo.rotation.z = t * 1.6
        // shells shimmer
        shellMats.forEach((sm, i) => {
          sm.opacity = 0.38 + i * 0.06 + Math.sin(t * 4 + i * 2.1) * 0.1
        })
      })
      break
    }
    case 'bulwark': {
      // ---- bulwark: siege tank — slab armour, glowing seams, iris eye, shield
      color = 0x37d0c0
      const m = addMat(hullMat(0x0c211f, color, 0.55))
      const body = new THREE.Mesh(chipGeo('bulwarkBody', 0.7), m)
      const plateMat = addMat(stdMat(0x132e2b, 0x2a8a80, 0.5))
      const plateGeo = cachedGeo('bulwarkPlate', () => new THREE.BoxGeometry(0.52, 0.52, 0.12))
      const plates: THREE.Mesh[] = []
      const platePos: [number, number, number, number][] = [
        [0.68, 0, 0, Math.PI / 2],
        [-0.68, 0, 0, Math.PI / 2],
        [0, 0.68, Math.PI / 2, 0],
        [0, -0.68, Math.PI / 2, 0],
      ]
      for (const [px, py, rx, rz] of platePos) {
        const plate = new THREE.Mesh(plateGeo, plateMat)
        plate.position.set(px, py, 0)
        plate.rotation.x = rx
        plate.rotation.z = rz
        group.add(plate)
        plates.push(plate)
      }
      // glowing seam strips between plates
      const seamMat = addMat(stdMat(color, color, 1.8))
      const seamGeoV = cachedGeo('bulwarkSeamV', () => new THREE.BoxGeometry(0.05, 1.15, 0.06))
      const seamGeoH = cachedGeo('bulwarkSeamH', () => new THREE.BoxGeometry(1.15, 0.05, 0.06))
      const seamV = new THREE.Mesh(seamGeoV, seamMat)
      const seamH = new THREE.Mesh(seamGeoH, seamMat)
      group.add(seamV, seamH)
      eyeMat = addMat(stdMat(color, color, 2.4))
      const eye = new THREE.Mesh(cachedGeo('bulwarkEye', () => new THREE.SphereGeometry(0.17, 12, 10)), eyeMat)
      eye.position.z = -0.72
      const iris = new THREE.Mesh(
        cachedGeo('bulwarkIris', () => new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10)),
        addMat(stdMat(0x04211d, 0x0affd8, 2.5)),
      )
      iris.rotation.x = Math.PI / 2
      iris.position.set(0, 0, -0.84)
      shieldMat = new THREE.MeshBasicMaterial({
        color: 0x4df3ff,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const shield = new THREE.Mesh(cachedGeo('bulwarkShield', () => new THREE.SphereGeometry(1.2, 20, 14)), shieldMat)
      group.add(body, eye, iris, seamV, seamH, shield, glowSprite(color, 1.1, 0.3))
      idleAnims.push((t, ph) => {
        // plates breathe outward slightly
        for (const plate of plates) plate.scale.setScalar(1 + Math.sin(t * 2 + ph) * 0.04)
        // seams pulse
        seamMat.emissiveIntensity = 1.4 + Math.sin(t * 3.5 + ph) * 0.6
        if (eyeMat) eyeMat.emissiveIntensity = 2.0 + Math.sin(t * 4.2 + ph) * 0.5
      })
      break
    }
    default: {
      // ---------------- bosses: citadel silhouettes with iris eye
      const bossColor = def.boss ? new THREE.Color(def.boss.color) : new THREE.Color(color)
      const c = bossColor.getHex()
      const r = def.radius
      const coreMat = addMat(hullMat(0x120e1e, c, 0.8))
      const core = new THREE.Mesh(cachedGeo(`bossCore-${def.id}`, () => chipGeo(`bossCoreG-${def.id}`, r * 0.5)), coreMat)
      eyeMat = addMat(stdMat(c, c, 2.4))
      const eye = new THREE.Mesh(cachedGeo(`bossEye-${def.id}`, () => new THREE.SphereGeometry(r * 0.24, 16, 12)), eyeMat)
      eye.position.z = -r * 0.28
      // iris slit over the eye for a menacing pupil
      const iris = new THREE.Mesh(
        cachedGeo(`bossIris-${def.id}`, () => new THREE.TorusGeometry(r * 0.24, r * 0.03, 8, 24)),
        addMat(stdMat(0x0a0612, c, 2.0)),
      )
      iris.position.z = -r * 0.34
      const ringMat = addMat(stdMat(c, c, 1.5))
      const spikeMat = addMat(hullMat(0x1a1226, c, 1.1))
      spin = new THREE.Group()

      if (def.id === 'warden_prime') {
        // three radial pylons + twin rings + under-slung engine cluster
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + Math.PI / 2
          spin.add(spike(`bossPylon-${def.id}-${i}`, r * 0.16, r * 0.85, spikeMat, Math.cos(a), Math.sin(a), 0, r * 0.72))
        }
        const ring1 = new THREE.Mesh(
          cachedGeo(`bossRing1-${def.id}`, () => new THREE.TorusGeometry(r * 0.95, 0.09, 8, 40)),
          ringMat,
        )
        const ring2 = new THREE.Mesh(
          cachedGeo(`bossRing2-${def.id}`, () => new THREE.TorusGeometry(r * 1.22, 0.05, 8, 44)),
          ringMat,
        )
        ring2.rotation.x = Math.PI / 2.4
        spin.add(ring1, ring2)
      } else if (def.id === 'warden_hex') {
        // hexagonal armour slabs + offset rings
        const plateGeo = cachedGeo(`bossHexPlate-${def.id}`, () => new THREE.BoxGeometry(r * 0.4, r * 0.4, r * 0.12))
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const plate = new THREE.Mesh(plateGeo, spikeMat)
          plate.position.set(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, 0)
          plate.rotation.z = a
          spin.add(plate)
        }
        const ring1 = new THREE.Mesh(
          cachedGeo(`bossRing1-${def.id}`, () => new THREE.TorusGeometry(r * 1.05, 0.07, 8, 48)),
          ringMat,
        )
        const ring2 = new THREE.Mesh(
          cachedGeo(`bossRing2-${def.id}`, () => new THREE.TorusGeometry(r * 1.3, 0.05, 8, 48)),
          ringMat,
        )
        ring2.rotation.x = Math.PI / 2
        spin.add(ring1, ring2)
      } else {
        // null_gate: monumental gate ring + inner spokes
        const gate = new THREE.Mesh(
          cachedGeo(`bossGate-${def.id}`, () => new THREE.TorusGeometry(r * 1.35, r * 0.11, 10, 56)),
          addMat(hullMat(0x1c0e14, c, 1.3)),
        )
        group.add(gate)
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          spin.add(spike(`bossSpoke-${def.id}-${i}`, r * 0.12, r * 0.7, spikeMat, Math.cos(a), Math.sin(a), 0, r * 0.55))
        }
        const ring1 = new THREE.Mesh(
          cachedGeo(`bossRing1-${def.id}`, () => new THREE.TorusGeometry(r * 0.8, 0.08, 8, 40)),
          ringMat,
        )
        ring1.rotation.x = Math.PI / 2.6
        spin.add(ring1)
      }
      const bossGlow = glowSprite(bossColor, r * 3.1, 0.4)
      const bossEng = engineGlow(c, 0, -r * 0.5, r * 0.9, r * 1.4, 0.5)
      engines.push(bossEng)
      group.add(spin, core, eye, iris, bossGlow, bossEng)
      idleAnims.push((t, ph) => {
        // the eye burns brighter as the core turns
        if (eyeMat) eyeMat.emissiveIntensity = 1.9 + Math.sin(t * 2.8 + ph) * 0.6
        iris.material.emissiveIntensity = 1.6 + Math.sin(t * 2.8 + ph + 0.8) * 0.5
      })
    }
  }

  return { group, flashMats, shieldMat, spin, def, idleAnims, engines, eyeMat }
}

// ---------------------------------------------------------------- bullets / shards

export function buildBulletVisual(): BulletVisual {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const mesh = new THREE.Mesh(cachedGeo('bullet', () => new THREE.SphereGeometry(1, 8, 6)), mat)
  const glow = glowSprite(0xffffff, 2.4, 0.9)
  group.add(mesh, glow)
  group.visible = false
  return { group, mat, glow, inUse: false }
}

export function buildShardVisual(): ShardVisual {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  // elongated crystal, facets catch the light as it tumbles
  const mesh = new THREE.Mesh(
    cachedGeo('shard', () => {
      const g = new THREE.OctahedronGeometry(0.26)
      g.scale(0.7, 1.5, 0.7)
      return g
    }),
    mat,
  )
  const glow = glowSprite(0xffffff, 1.2, 0.8)
  group.add(mesh, glow)
  group.visible = false
  return { group, mat, spin: Math.random() * Math.PI * 2 }
}
