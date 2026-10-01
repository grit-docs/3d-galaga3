import * as THREE from 'three'
import type { QualitySettings } from './quality'

const NEBULA_VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const NEBULA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uProgress; // 0..1 across the run, shifts the palette deep-teal -> magenta
varying vec3 vPos;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vPos);

  // slowly drifting cloud fields
  float n = fbm(d * 3.0 + vec3(0.0, uTime * 0.008, 1.7));
  float n2 = fbm(d * 6.0 + 4.2);
  float n3 = fbm(d * 12.0 - vec3(uTime * 0.01, 0.0, 0.0));

  // a luminous galactic band tilted across the sky
  float bandAxis = dot(d, normalize(vec3(0.35, 0.85, 0.4)));
  float band = exp(-bandAxis * bandAxis * 9.0);
  float filaments = smoothstep(0.45, 0.9, fbm(d * 9.0 + 8.3)) * band;

  // deep-run palette drift: teal-blue -> violet -> magenta
  float p = clamp(uProgress, 0.0, 1.0);
  vec3 deep1 = mix(vec3(0.012, 0.035, 0.09), vec3(0.05, 0.015, 0.09), p);
  vec3 deep2 = mix(vec3(0.08, 0.02, 0.15), vec3(0.16, 0.03, 0.13), p);
  vec3 deep3 = mix(vec3(0.01, 0.09, 0.12), vec3(0.1, 0.02, 0.16), p);
  vec3 bandCol = mix(vec3(0.10, 0.16, 0.30), vec3(0.24, 0.07, 0.26), p);

  vec3 col = mix(deep1, deep2, smoothstep(0.35, 0.75, n));
  col = mix(col, deep3, smoothstep(0.55, 0.92, n2) * 0.7);
  col += bandCol * band * (0.35 + 0.2 * sin(uTime * 0.05 + n3 * 4.0));
  col += bandCol * filaments * 1.1;

  // faint high-frequency shimmer
  col += vec3(0.02, 0.03, 0.05) * smoothstep(0.6, 1.0, n3) * (0.5 + 0.5 * sin(uTime * 0.8));

  gl_FragColor = vec4(col, 1.0);
}
`

/** Star palette: white / ice blue / warm gold / cyan, weighted. */
const STAR_COLORS: [number, number, number][] = [
  [1.0, 1.0, 1.0],
  [1.0, 1.0, 1.0],
  [0.72, 0.85, 1.0],
  [0.72, 0.85, 1.0],
  [1.0, 0.88, 0.66],
  [0.55, 0.95, 1.0],
]

function makeStars(count: number, size: number, opacity: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const palette = STAR_COLORS
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * 170
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * 110
    positions[i * 3 + 2] = -40 - Math.random() * 220
    const c = palette[Math.floor(Math.random() * palette.length)]
    colors[i * 3] = c[0]
    colors[i * 3 + 1] = c[1]
    colors[i * 3 + 2] = c[2]
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    vertexColors: true,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    depthWrite: false,
    fog: false, // backdrop must ignore scene fog or deep stars go black
  })
  const pts = new THREE.Points(geom, mat)
  pts.frustumCulled = false
  return pts
}

/** Canvas-painted banded gas planet, reused across planets with different tints. */
function planetTexture(hue: number): THREE.CanvasTexture {
  const w = 256
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // vertical band gradient in HSL, offset noise per band
  let y = 0
  let band = 0
  while (y < h) {
    const bh = 6 + Math.random() * 14
    const light = 30 + Math.random() * 22
    const sat = 30 + Math.random() * 35
    const hueJ = hue + (Math.random() * 24 - 12)
    ctx.fillStyle = `hsl(${hueJ}, ${sat}%, ${light}%)`
    ctx.fillRect(0, y, w, bh)
    // subtle swirl streaks
    ctx.strokeStyle = `hsla(${hueJ}, ${sat + 15}%, ${light + 14}%, 0.25)`
    ctx.lineWidth = 1
    ctx.beginPath()
    const cy = y + bh / 2
    ctx.moveTo(0, cy)
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(x, cy + Math.sin(x * 0.05 + band * 1.7) * 2.5)
    }
    ctx.stroke()
    y += bh
    band++
  }
  // soft polar shading
  const shade = ctx.createLinearGradient(0, 0, 0, h)
  shade.addColorStop(0, 'rgba(0,0,10,0.55)')
  shade.addColorStop(0.25, 'rgba(0,0,10,0)')
  shade.addColorStop(0.75, 'rgba(0,0,10,0)')
  shade.addColorStop(1, 'rgba(0,0,10,0.55)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makePlanet(radius: number, hue: number, x: number, y: number, z: number): THREE.Group {
  const group = new THREE.Group()
  const tex = planetTexture(hue)
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false })
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), mat)
  group.add(body)
  // atmospheric rim glow
  const glowTex = atmosphereTexture()
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: new THREE.Color().setHSL(hue / 360, 0.7, 0.6),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.setScalar(radius * 2.6)
  group.add(glow)
  group.position.set(x, y, z)
  return group
}

let atmoTex: THREE.CanvasTexture | null = null
function atmosphereTexture(): THREE.CanvasTexture {
  if (atmoTex) return atmoTex
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.62, 'rgba(255,255,255,0.28)')
  g.addColorStop(0.78, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  atmoTex = new THREE.CanvasTexture(canvas)
  return atmoTex
}

/** Canvas-painted distant spiral galaxy sprite. */
function galaxyTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.translate(size / 2, size / 2)
  // bright core
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.12)
  core.addColorStop(0, 'rgba(255,250,235,0.95)')
  core.addColorStop(1, 'rgba(255,220,170,0)')
  ctx.fillStyle = core
  ctx.fillRect(-size / 2, -size / 2, size, size)
  // two logarithmic spiral arms of soft dots
  for (const dir of [1, -1]) {
    for (let i = 0; i < 220; i++) {
      const t = i / 220
      const r = 8 + Math.pow(t, 0.75) * size * 0.46
      const a = dir * (t * 4.2)
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r * 0.42 // elliptical tilt
      const jitter = (Math.random() - 0.5) * 10
      const alpha = 0.5 * (1 - t) + 0.08
      const hue = 190 + Math.random() * 100 // cyan -> violet
      ctx.fillStyle = `hsla(${hue}, 85%, ${62 + Math.random() * 18}%, ${alpha})`
      ctx.beginPath()
      ctx.arc(x + jitter, y + jitter * 0.5, 1.1 + Math.random() * 1.9, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Meteor streak pool: occasional bright dashes crossing the deep field. */
interface Meteor {
  sprite: THREE.Sprite
  mat: THREE.SpriteMaterial
  vel: THREE.Vector3
  life: number
  maxLife: number
}

function makeMeteor(): Meteor {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 8
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.7, 'rgba(190,235,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 8)
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.visible = false
  return { sprite, mat, vel: new THREE.Vector3(), life: 0, maxLife: 1 }
}

function makeGrid(): THREE.LineSegments {
  const xs: number[] = []
  const X = 48
  const Z0 = -150
  const Z1 = 20
  const step = 8
  for (let x = -X; x <= X; x += step) {
    xs.push(x, -9, Z0, x, -9, Z1)
  }
  for (let z = Z0; z <= Z1; z += step) {
    xs.push(-X, -9, z, X, -9, z)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(xs), 3))
  const mat = new THREE.LineBasicMaterial({ color: 0x123a52, transparent: true, opacity: 0.55, fog: false })
  return new THREE.LineSegments(geom, mat)
}

/** Fading starfield band hugging the grid horizon. */
function makeHorizonGlow(): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, 'rgba(70,170,220,0)')
  g.addColorStop(0.5, 'rgba(70,170,220,0.35)')
  g.addColorStop(1, 'rgba(70,170,220,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 2, 128)
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const s = new THREE.Sprite(mat)
  s.scale.set(320, 26, 1)
  s.position.set(0, -7.5, -90)
  return s
}

/** Procedural space backdrop: shader nebula with galactic band, tri-layer colored
 *  stars with twinkle, gas planets, spiral galaxy, meteors, scrolling grid, gate rings. */
export class Background {
  readonly group = new THREE.Group()
  private stars1: THREE.Points | null = null
  private stars2: THREE.Points | null = null
  private stars3: THREE.Points | null = null
  private nebula: THREE.Mesh | null = null
  private nebulaMat: THREE.ShaderMaterial | null = null
  private grid: THREE.LineSegments | null = null
  private horizon: THREE.Sprite | null = null
  private rings: THREE.Mesh[] = []
  private ringGeo: THREE.TorusGeometry | null = null
  private planets: THREE.Group[] = []
  private galaxy: THREE.Sprite | null = null
  private meteors: Meteor[] = []
  private meteorTimer = 4
  private t = 0
  private progress = 0

  setQuality(qs: QualitySettings): void {
    this.clear()
    this.stars1 = makeStars(Math.floor(qs.stars * 0.5), 0.55, 0.9)
    this.stars2 = makeStars(Math.floor(qs.stars * 0.3), 0.32, 0.6)
    this.stars3 = makeStars(Math.floor(qs.stars * 0.2), 0.2, 0.4)
    this.grid = makeGrid()
    this.horizon = makeHorizonGlow()
    this.group.add(this.stars1, this.stars2, this.stars3, this.grid, this.horizon)
    if (qs.nebula) {
      this.nebulaMat = new THREE.ShaderMaterial({
        vertexShader: NEBULA_VERT,
        fragmentShader: NEBULA_FRAG,
        uniforms: { uTime: { value: 0 }, uProgress: { value: 0 } },
        side: THREE.BackSide,
        depthWrite: false,
      })
      this.nebula = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 24), this.nebulaMat)
      this.group.add(this.nebula)
      // gas planets + spiral galaxy (mid-tier tiers skip via nebula flag)
      this.planets = [
        makePlanet(9, 205, -70, 26, -150),
        makePlanet(5, 285, 78, 40, -230),
        makePlanet(3.4, 150, 40, -34, -190),
      ]
      for (const p of this.planets) this.group.add(p)
      this.galaxy = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: galaxyTexture(),
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      )
      this.galaxy.scale.setScalar(150)
      this.galaxy.position.set(95, 55, -270)
      this.galaxy.material.rotation = -0.5
      this.group.add(this.galaxy)
    }
    const meteorCount = qs.id === 'low' ? 2 : 4
    for (let i = 0; i < meteorCount; i++) {
      const m = makeMeteor()
      this.meteors.push(m)
      this.group.add(m.sprite)
    }
    this.ringGeo = new THREE.TorusGeometry(26, 0.22, 8, 48)
    for (let i = 0; i < qs.rings; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x1d5a7a : 0x5a2a6a,
        transparent: true,
        opacity: 0.5,
        fog: false,
      })
      const ring = new THREE.Mesh(this.ringGeo, mat)
      ring.position.set(0, 0, -30 - i * (150 / Math.max(1, qs.rings)))
      this.rings.push(ring)
      this.group.add(ring)
    }
  }

  /** 0..1 run progress; drifts the nebula palette teal -> magenta. */
  setProgress(p: number): void {
    this.progress = Math.max(0, Math.min(1, p))
  }

  update(dt: number, playerPos: { x: number; y: number; z: number }): void {
    this.t += dt
    if (this.nebulaMat) {
      this.nebulaMat.uniforms.uTime.value = this.t
      this.nebulaMat.uniforms.uProgress.value = this.progress
    }
    // parallax: deep layer barely moves, near layer swims
    if (this.stars1) {
      this.stars1.position.x = -playerPos.x * 0.12
      this.stars1.position.y = -playerPos.y * 0.12
    }
    if (this.stars2) {
      this.stars2.position.x = -playerPos.x * 0.3
      this.stars2.position.y = -playerPos.y * 0.3
    }
    if (this.stars3) {
      this.stars3.position.x = -playerPos.x * 0.05
      this.stars3.position.y = -playerPos.y * 0.05
    }
    // scrolling grid gives a constant sense of forward motion
    if (this.grid) {
      this.grid.position.z = (this.t * 12) % 8
    }
    if (this.horizon) {
      this.horizon.position.x = -playerPos.x * 0.08
    }
    // planets rotate slowly to feel alive (they are far away, no parallax)
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i]
      p.rotation.y += dt * (0.008 + i * 0.004)
      p.rotation.z = Math.sin(this.t * 0.05 + i) * 0.03
    }
    if (this.galaxy) this.galaxy.material.rotation += dt * 0.004
    // gate rings fly past, pulsing gently
    for (const ring of this.rings) {
      ring.position.z += dt * 16
      ring.rotation.z += dt * 0.25
      const k = 0.42 + 0.14 * Math.sin(this.t * 1.4 + ring.position.z * 0.05)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = k
      if (ring.position.z > 24) ring.position.z -= 150
    }
    // meteors: spawn on a jittered timer, streak across the deep field
    this.meteorTimer -= dt
    if (this.meteorTimer <= 0) {
      this.meteorTimer = 5 + Math.random() * 7
      const m = this.meteors.find((x) => x.life <= 0)
      if (m) {
        const sx = (Math.random() * 2 - 1) * 90
        const sy = 20 + Math.random() * 50
        const sz = -120 - Math.random() * 80
        m.sprite.position.set(sx, sy, sz)
        m.vel.set(-(24 + Math.random() * 30), -(10 + Math.random() * 14), 10)
        m.maxLife = 1.4 + Math.random() * 0.8
        m.life = m.maxLife
        m.sprite.visible = true
        m.mat.rotation = Math.atan2(m.vel.y, m.vel.x)
      }
    }
    for (const m of this.meteors) {
      if (m.life <= 0) continue
      m.life -= dt
      m.sprite.position.addScaledVector(m.vel, dt)
      const k = m.life / m.maxLife
      m.mat.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.9
      if (m.life <= 0) m.sprite.visible = false
    }
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
    }
    this.stars1 = null
    this.stars2 = null
    this.stars3 = null
    this.nebula = null
    this.nebulaMat = null
    this.grid = null
    this.horizon = null
    this.rings = []
    this.planets = []
    this.galaxy = null
    this.meteors = []
  }

  dispose(): void {
    this.clear()
  }
}
