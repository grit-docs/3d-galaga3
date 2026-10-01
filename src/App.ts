import * as THREE from 'three'
import { Engine, type InputState } from './game/engine'
import { LOGIC_STEP } from './game/types'
import { Renderer } from './render/renderer'
import type { Quality } from './render/quality'
import { Sound } from './audio/sound'
import { UI } from './ui/ui'
import type { GameEvent } from './game/types'

const SETTINGS_KEY = 'halcyon.settings.v1'
const BEST_KEY = 'halcyon.best.v1'

export interface GameSettings {
  quality: Quality
  sfx: number
  music: number
  musicOn: boolean
}

function loadSettings(): GameSettings {
  const fallback: GameSettings = { quality: 'medium', sfx: 0.8, music: 0.55, musicOn: true }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<GameSettings>
    return {
      quality: p.quality === 'low' || p.quality === 'high' ? p.quality : fallback.quality,
      sfx: typeof p.sfx === 'number' ? Math.min(1, Math.max(0, p.sfx)) : fallback.sfx,
      music: typeof p.music === 'number' ? Math.min(1, Math.max(0, p.music)) : fallback.music,
      musicOn: typeof p.musicOn === 'boolean' ? p.musicOn : fallback.musicOn,
    }
  } catch {
    return fallback
  }
}

function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

type ScreenName = 'title' | 'upgrade' | 'paused' | 'gameover' | 'settings' | null

export class App {
  readonly engine: Engine
  private renderer: Renderer
  private sound: Sound
  private ui: UI
  private settings: GameSettings
  private best: number
  private raf = 0
  private last = -1
  private acc = 0
  private paused = false
  private settingsOpen = false
  private upgradeBuilt = false
  private keys = new Set<string>()
  private mouse = { x: 0, y: 0, down: false }
  private raycaster = new THREE.Raycaster()
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 20)
  private aimHit = new THREE.Vector3()
  private lastHitSound = 0
  private canvas: HTMLCanvasElement
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.engine = new Engine()
    this.settings = loadSettings()
    this.best = loadBest()
    this.engine.bestScore = this.best
    this.renderer = new Renderer(canvas, this.settings.quality)
    this.sound = new Sound()
    this.sound.setSettings({ sfx: this.settings.sfx, music: this.settings.music, musicOn: this.settings.musicOn })
    this.ui = new UI({
      onStart: () => this.startRun(),
      onOpenSettings: () => this.openSettings(),
      onResume: () => this.setPaused(false),
      onRestart: () => this.startRun(),
      onQuit: () => this.toTitle(),
      onRetry: () => this.startRun(),
      onTitle: () => this.toTitle(),
      onCloseSettings: () => this.closeSettings(),
      onPickUpgrade: (id) => this.pickUpgrade(id),
      onQuality: (q) => this.updateSettings({ quality: q }),
      onSfxVolume: (v) => this.updateSettings({ sfx: v }),
      onMusicVolume: (v) => this.updateSettings({ music: v }),
      onMusicToggle: (on) => this.updateSettings({ musicOn: on }),
    })
  }

  start(): void {
    this.bindInput()
    this.ui.syncSettings(this.settings.quality, this.settings.sfx, this.settings.music, this.settings.musicOn)
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
    this.exposeDebug()
  }

  // ------------------------------------------------------------- flow

  startRun(): void {
    this.sound.init(this.engine.seed)
    if (this.settings.musicOn) this.sound.startMusic()
    this.engine.bestScore = this.best
    this.paused = false
    this.settingsOpen = false
    this.upgradeBuilt = false
    this.engine.begin()
    this.sound.play('ui')
  }

  toTitle(): void {
    this.engine.toMenu()
    this.paused = false
    this.settingsOpen = false
    this.upgradeBuilt = false
    this.sound.stopMusic()
  }

  pickUpgrade(id: string): void {
    this.sound.play('ui')
    this.engine.chooseUpgrade(id)
    this.upgradeBuilt = false
  }

  togglePause(): void {
    const s = this.engine.state
    if (s !== 'playing' && s !== 'upgrade') return
    if (this.settingsOpen) return
    this.setPaused(!this.paused)
  }

  setPaused(v: boolean): void {
    const s = this.engine.state
    if (!v && s !== 'playing' && s !== 'upgrade') return
    this.paused = v
    this.sound.play('ui')
  }

  openSettings(): void {
    this.settingsOpen = true
  }

  closeSettings(): void {
    this.settingsOpen = false
    this.sound.play('ui')
  }

  updateSettings(patch: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    } catch {
      // storage unavailable
    }
    this.renderer.setQuality(this.settings.quality)
    this.sound.setSettings({ sfx: this.settings.sfx, music: this.settings.music, musicOn: this.settings.musicOn })
    if (this.sound.isRunning) {
      if (this.settings.musicOn) this.sound.startMusic()
      else this.sound.stopMusic()
    }
    this.ui.syncSettings(this.settings.quality, this.settings.sfx, this.settings.music, this.settings.musicOn)
  }

  // ------------------------------------------------------------- input

  private bindInput(): void {
    const canvas = this.canvas
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) {
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
        return
      }
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
        case 'KeyA':
        case 'ArrowLeft':
        case 'KeyS':
        case 'ArrowDown':
        case 'KeyD':
        case 'ArrowRight':
          e.preventDefault()
          break
        case 'KeyP':
        case 'Escape':
          this.togglePause()
          return
        case 'Space':
          e.preventDefault()
          this.engine.tryPhase()
          break
        case 'KeyQ':
          this.engine.tryWeave()
          break
        case 'KeyR':
          this.engine.tryBomb()
          break
        case 'Digit1':
          this.engine.selectWeapon(0)
          break
        case 'Digit2':
          this.engine.selectWeapon(1)
          break
        case 'Digit3':
          this.engine.selectWeapon(2)
          break
        default:
          return
      }
      this.keys.add(e.code)
      this.rebuildMove()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code)
      this.rebuildMove()
    }
    const onMouseMove = (e: MouseEvent) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      this.mouse.down = true
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return
      this.mouse.down = false
    }
    const onBlur = () => {
      this.keys.clear()
      this.mouse.down = false
      this.rebuildMove()
      const s = this.engine.state
      if (s === 'playing' || s === 'upgrade') this.setPaused(true)
    }
    const onResize = () => this.renderer.resize()
    const onContext = (e: Event) => e.preventDefault()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onResize)
    canvas.addEventListener('contextmenu', onContext)
    this.unbinders = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('mousemove', onMouseMove),
      () => canvas.removeEventListener('mousedown', onMouseDown),
      () => window.removeEventListener('mouseup', onMouseUp),
      () => window.removeEventListener('blur', onBlur),
      () => window.removeEventListener('resize', onResize),
      () => canvas.removeEventListener('contextmenu', onContext),
    ]
  }

  private unbinders: Array<() => void> = []

  private rebuildMove(): void {
    const k = this.keys
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    const l = Math.hypot(x, y)
    const input: InputState = this.engine.input
    input.move.x = l > 0 ? x / l : 0
    input.move.y = l > 0 ? y / l : 0
  }

  private updateAim(): void {
    const cam = this.renderer.camera
    this.raycaster.setFromCamera(new THREE.Vector2(this.mouse.x, this.mouse.y), cam)
    const hit = this.raycaster.ray.intersectPlane(this.aimPlane, this.aimHit)
    const p = this.engine.player
    if (hit) {
      const dx = hit.x - p.pos.x
      const dy = hit.y - p.pos.y
      const dz = hit.z - p.pos.z
      const l = Math.hypot(dx, dy, dz) || 1
      const aim = this.engine.input.aim
      aim.x = dx / l
      aim.y = dy / l
      aim.z = dz / l
      // always aim forward (into the field)
      if (aim.z > -0.12) {
        aim.z = -0.12
        const l2 = Math.hypot(aim.x, aim.y, aim.z)
        aim.x /= l2
        aim.y /= l2
        aim.z /= l2
      }
    }
  }

  // ------------------------------------------------------------- loop

  private loop = (tms: number): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = this.last < 0 ? 0 : Math.min(0.1, (tms - this.last) / 1000)
    this.last = tms
    this.updateAim()
    const input = this.engine.input
    input.firing = this.mouse.down && this.engine.state === 'playing' && !this.paused

    if (!this.paused && this.engine.state === 'playing') {
      this.acc += dt
      let steps = 0
      while (this.acc >= LOGIC_STEP && steps < 8) {
        this.engine.step(LOGIC_STEP)
        this.acc -= LOGIC_STEP
        steps += 1
      }
      if (steps >= 8) this.acc = 0
    }

    const events = this.engine.events.splice(0)
    if (events.length > 0) {
      this.handleEvents(events)
      this.renderer.handleEvents(events)
    }

    // upgrade screen cards (built once per upgrade)
    if (this.engine.state === 'upgrade' && !this.upgradeBuilt) {
      this.upgradeBuilt = true
      this.ui.showUpgradeChoices(this.engine.upgradeChoices ?? [], (id) => this.pickUpgrade(id))
    }

    this.renderer.frame(this.engine, dt)
    this.ui.updateHud(this.engine, this.best)
    this.updateScreen()
  }

  private handleEvents(events: GameEvent[]): void {
    const now = performance.now()
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          this.sound.play('shoot')
          break
        case 'enemyHit':
          if (now - this.lastHitSound > 30) {
            this.lastHitSound = now
            this.sound.play('hit')
          }
          break
        case 'explosion':
          this.sound.play(ev.size >= 2 ? 'bigexplosion' : 'explosion')
          break
        case 'enemyDeath':
          break
        case 'playerHit':
          this.sound.play('hurt')
          this.ui.flash()
          break
        case 'shardPickup':
          this.sound.play('pickup')
          break
        case 'weave':
          this.sound.play('weave')
          break
        case 'phase':
          this.sound.play('phase')
          break
        case 'bomb':
          this.sound.play('bomb')
          break
        case 'waveStart':
          this.ui.setBanner(`WAVE ${ev.index + 1} · ${ev.label}`, !!ev.boss)
          break
        case 'bossAlert':
          this.ui.setBanner(`⚠ ${ev.name} ⚠`, true)
          this.sound.play('bossalert')
          break
        case 'waveClear':
          this.sound.play('waveclear')
          break
        case 'gameOver':
          this.onGameOver(ev)
          break
        default:
          break
      }
    }
  }

  private onGameOver(ev: { victory: boolean; score: number; wave: number; kills: number; time: number }): void {
    const newBest = ev.score > this.best
    if (newBest) {
      this.best = ev.score
      try {
        localStorage.setItem(BEST_KEY, String(this.best))
      } catch {
        // storage unavailable
      }
      this.engine.bestScore = this.best
    }
    this.ui.showGameOver({ victory: ev.victory, score: ev.score, wave: ev.wave, kills: ev.kills, time: ev.time }, this.best, newBest)
    this.sound.stopMusic()
  }

  private updateScreen(): void {
    let screen: ScreenName = null
    const s = this.engine.state
    if (s === 'menu') screen = 'title'
    else if (s === 'gameover') screen = 'gameover'
    else if (s === 'upgrade' && !this.paused) screen = 'upgrade'
    if (this.paused) screen = 'paused'
    if (this.settingsOpen) screen = 'settings'
    this.ui.showScreen(screen)
  }

  // ------------------------------------------------------------- debug

  private exposeDebug(): void {
    const w = window as unknown as Record<string, unknown>
    w.__halcyon = {
      engine: this.engine,
      start: () => this.startRun(),
      pause: () => this.togglePause(),
      resume: () => this.setPaused(false),
      forceGameOver: () => this.engine.debugKillPlayer(),
      clearWave: () => this.engine.debugClearWave(),
      addShard: (f: 'pulse' | 'arc' | 'void') => this.engine.debugAddShard(f),
      pickUpgrade: (i = 0) => {
        const c = this.engine.upgradeChoices
        if (c && c[i]) this.pickUpgrade(c[i].id)
      },
      state: () => this.engine.state,
    }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    for (const u of this.unbinders) u()
    this.unbinders = []
    this.ui.dispose()
    this.sound.dispose()
    this.renderer.dispose()
  }
}
