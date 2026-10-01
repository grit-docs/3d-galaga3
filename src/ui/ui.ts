import type { Engine } from '../game/engine'
import { weaponDef } from '../game/data/weapons'
import { enemyDef } from '../game/data/enemies'
import type { UpgradeDef } from '../game/types'
import { WEAVE_CAP } from '../game/types'
import { RARITY_LABELS } from '../game/data/upgrades'
import { TOTAL_WAVES } from '../game/data/waves'
import type { Quality } from '../render/quality'

export interface GameOverInfo {
  victory: boolean
  score: number
  wave: number
  kills: number
  time: number
}

export interface UICallbacks {
  onStart: () => void
  onOpenSettings: () => void
  onResume: () => void
  onRestart: () => void
  onQuit: () => void
  onRetry: () => void
  onTitle: () => void
  onCloseSettings: () => void
  onPickUpgrade: (id: string) => void
  onQuality: (q: Quality) => void
  onSfxVolume: (v: number) => void
  onMusicVolume: (v: number) => void
  onMusicToggle: (on: boolean) => void
}

interface WeaponSlotEl {
  root: HTMLElement
  name: HTMLElement
  pips: HTMLElement[]
  timer: HTMLElement
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element #${id}`)
  return el
}

export class UI {
  private cb: UICallbacks
  private els = new Map<string, HTMLElement>()
  private slots: WeaponSlotEl[] = []
  private bannerUntil = 0
  private lastScore = -1
  private lastBest = -1
  private flashTimeout = 0
  private unbinders: Array<() => void> = []

  constructor(cb: UICallbacks) {
    this.cb = cb
    for (const id of [
      'hud', 'hp-fill', 'hp-text', 'shield-fill', 'shield-text',
      'wave-label', 'wave-name', 'score', 'best',
      'boss-wrap', 'boss-name', 'boss-fill',
      'combo-wrap', 'combo-mult', 'weapons',
      'phase-chip', 'phase-fill', 'bomb-chip',
      'banner', 'banner-text', 'flash',
      'screen-title', 'screen-upgrade', 'screen-paused', 'screen-gameover', 'screen-settings',
      'title-best', 'upgrade-cards',
      'over-title', 'over-sub', 'over-stats',
      'vol-sfx', 'vol-sfx-val', 'vol-music', 'vol-music-val', 'toggle-music',
    ]) {
      this.els.set(id, $(id))
    }
    this.buildWeaponSlots()
    this.bindButtons()
  }

  private buildWeaponSlots(): void {
    const container = this.els.get('weapons')!
    for (let i = 0; i < 3; i++) {
      const root = document.createElement('div')
      root.className = 'weapon-slot empty'
      root.dataset.slot = String(i)
      const key = document.createElement('div')
      key.className = 'w-key'
      key.textContent = `${i + 1}`
      const name = document.createElement('div')
      name.className = 'w-name'
      name.textContent = '—'
      const pips = document.createElement('div')
      pips.className = 'w-pips'
      const pipEls: HTMLElement[] = []
      for (let p = 0; p < WEAVE_CAP; p++) {
        const pip = document.createElement('div')
        pip.className = 'w-pip'
        pips.appendChild(pip)
        pipEls.push(pip)
      }
      const timer = document.createElement('div')
      timer.className = 'w-weave-timer'
      root.append(key, name, pips, timer)
      container.appendChild(root)
      this.slots.push({ root, name, pips: pipEls, timer })
    }
  }

  private bindButtons(): void {
    const on = (id: string, handler: (e: Event) => void) => {
      const el = this.els.get(id) ?? document.getElementById(id)!
      el.addEventListener('click', handler)
      this.unbinders.push(() => el.removeEventListener('click', handler))
    }
    on('btn-start', () => this.cb.onStart())
    on('btn-title-settings', () => this.cb.onOpenSettings())
    on('btn-resume', () => this.cb.onResume())
    on('btn-pause-settings', () => this.cb.onOpenSettings())
    on('btn-restart', () => this.cb.onRestart())
    on('btn-quit', () => this.cb.onQuit())
    on('btn-retry', () => this.cb.onRetry())
    on('btn-title', () => this.cb.onTitle())
    on('btn-settings-close', () => this.cb.onCloseSettings())
    const seg = document.getElementById('seg-quality')!
    for (const btn of Array.from(seg.querySelectorAll<HTMLButtonElement>('button'))) {
      const h = () => {
        const q = btn.dataset.quality as Quality
        if (q) this.cb.onQuality(q)
      }
      btn.addEventListener('click', h)
      this.unbinders.push(() => btn.removeEventListener('click', h))
    }
    const sfx = document.getElementById('vol-sfx') as HTMLInputElement
    sfx.addEventListener('input', () => this.cb.onSfxVolume(Number(sfx.value) / 100))
    this.unbinders.push(() => sfx.removeEventListener('input', () => this.cb.onSfxVolume(Number(sfx.value) / 100)))
    const music = document.getElementById('vol-music') as HTMLInputElement
    music.addEventListener('input', () => this.cb.onMusicVolume(Number(music.value) / 100))
    this.unbinders.push(() => music.removeEventListener('input', () => this.cb.onMusicVolume(Number(music.value) / 100)))
    const tgl = document.getElementById('toggle-music')!
    const th = () => {
      const on = (tgl as HTMLButtonElement).textContent.trim() === 'OFF'
      this.cb.onMusicToggle(on)
    }
    tgl.addEventListener('click', th)
    this.unbinders.push(() => tgl.removeEventListener('click', th))
  }

  showScreen(name: 'title' | 'upgrade' | 'paused' | 'gameover' | 'settings' | null): void {
    const screens: Array<'title' | 'upgrade' | 'paused' | 'gameover' | 'settings'> = ['title', 'upgrade', 'paused', 'gameover', 'settings']
    for (const s of screens) {
      const el = this.els.get(`screen-${s}`)!
      el.classList.toggle('hidden', s !== name)
    }
  }

  updateHud(engine: Engine, best: number): void {
    const inGame = engine.state === 'playing' || engine.state === 'upgrade' || engine.state === 'gameover'
    this.els.get('hud')!.classList.toggle('hidden', !inGame)

    const p = engine.player
    const hpFrac = Math.max(0, p.hp / p.maxHp)
    const hpFill = this.els.get('hp-fill') as HTMLElement
    hpFill.style.width = `${hpFrac * 100}%`
    hpFill.classList.toggle('low', hpFrac < 0.3)
    this.els.get('hp-text')!.textContent = String(Math.ceil(p.hp))
    const shFrac = Math.max(0, p.shield / p.maxShield)
    ;(this.els.get('shield-fill') as HTMLElement).style.width = `${shFrac * 100}%`
    this.els.get('shield-text')!.textContent = String(Math.floor(p.shield))

    const wave = engine.waveIndex + 1
    this.els.get('wave-label')!.textContent = `WAVE ${Math.max(1, wave)}/${TOTAL_WAVES}`
    const def = engine.waveDef
    this.els.get('wave-name')!.textContent = def ? def.label : '—'

    if (engine.score !== this.lastScore) {
      this.lastScore = engine.score
      this.els.get('score')!.textContent = engine.score.toLocaleString()
    }
    if (best !== this.lastBest) {
      this.lastBest = best
      this.els.get('best')!.textContent = best.toLocaleString()
      this.els.get('title-best')!.textContent = `BEST ${best.toLocaleString()}`
    }

    // boss bar
    const boss = engine.enemies.find((e) => enemyDef(e.defId).boss)
    this.els.get('boss-wrap')!.classList.toggle('hidden', !boss)
    if (boss) {
      const bdef = enemyDef(boss.defId)
      this.els.get('boss-name')!.textContent = bdef.name.toUpperCase()
      ;(this.els.get('boss-fill') as HTMLElement).style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`
    }

    // combo
    const showCombo = engine.comboCount > 1
    this.els.get('combo-wrap')!.classList.toggle('hidden', !showCombo)
    if (showCombo) {
      this.els.get('combo-mult')!.textContent = `x${engine.multiplier.toFixed(1)}`
    }

    // weapon slots
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      const w = p.weapons[i]
      if (!w) {
        slot.root.className = 'weapon-slot empty'
        slot.name.textContent = '—'
        slot.timer.textContent = ''
        for (const pip of slot.pips) pip.classList.remove('on')
        continue
      }
      const wdef = weaponDef(w.defId)
      const active = p.weaponSlot === i
      const weaving = p.weaveActive[wdef.freq] > 0
      let cls = 'weapon-slot'
      if (active) cls += ' active'
      if (weaving) cls += ' weaving'
      else if (p.weave[wdef.freq] >= WEAVE_CAP) cls += ' weave-ready'
      slot.root.className = cls
      slot.root.style.color = weaving ? '#ffb45e' : ''
      slot.name.textContent = wdef.name
      const filled = p.weave[wdef.freq]
      for (let pi = 0; pi < slot.pips.length; pi++) {
        slot.pips[pi].classList.toggle('on', pi < filled)
      }
      slot.timer.textContent = weaving ? `${p.weaveActive[wdef.freq].toFixed(1)}s` : ''
    }

    // phase chip
    const phaseFrac = 1 - p.phaseCd / 4
    ;(this.els.get('phase-fill') as HTMLElement).style.width = `${Math.max(0, Math.min(1, phaseFrac)) * 100}%`
    this.els.get('phase-chip')!.classList.toggle('ready', p.phaseCd <= 0)

    // bomb chip
    this.els.get('bomb-chip')!.classList.toggle('hidden', engine.mods.bomb <= 0)

    // banner
    if (performance.now() > this.bannerUntil) {
      this.els.get('banner')!.classList.add('hidden')
    }
  }

  setBanner(text: string, boss: boolean): void {
    const banner = this.els.get('banner')!
    this.els.get('banner-text')!.textContent = text
    banner.classList.remove('hidden')
    banner.classList.toggle('boss', boss)
    this.bannerUntil = performance.now() + (boss ? 2800 : 2000)
  }

  flash(): void {
    const el = this.els.get('flash')!
    el.style.opacity = '1'
    window.clearTimeout(this.flashTimeout)
    this.flashTimeout = window.setTimeout(() => {
      el.style.opacity = '0'
    }, 80)
  }

  showUpgradeChoices(choices: UpgradeDef[], onPick: (id: string) => void): void {
    const box = this.els.get('upgrade-cards')!
    box.innerHTML = ''
    for (const c of choices) {
      const card = document.createElement('div')
      card.className = `card r-${c.rarity}`
      const rarity = document.createElement('div')
      rarity.className = 'rarity'
      rarity.textContent = RARITY_LABELS[c.rarity]
      const name = document.createElement('div')
      name.className = 'c-name'
      name.textContent = c.name
      const desc = document.createElement('div')
      desc.className = 'c-desc'
      desc.textContent = c.desc
      card.append(rarity, name, desc)
      const h = () => onPick(c.id)
      card.addEventListener('click', h)
      box.appendChild(card)
      card.dataset.testid = `card-${c.id}`
    }
  }

  showGameOver(info: GameOverInfo, best: number, newBest: boolean): void {
    this.els.get('over-title')!.textContent = info.victory ? 'GATE ESCAPED' : 'SIGNAL LOST'
    this.els.get('over-sub')!.textContent = info.victory
      ? '널 게이트를 돌파했다. 성단의 데이터는 살아남았다.'
      : '관문은 침묵했다. 하지만 공진은 다시 울릴 수 있다.'
    const mm = Math.floor(info.time / 60)
    const ss = Math.floor(info.time % 60)
    const stats = this.els.get('over-stats')!
    stats.innerHTML = ''
    const add = (key: string, val: string, gold = false) => {
      const d = document.createElement('div')
      const k = document.createElement('span')
      k.className = 's-key'
      k.textContent = key
      const v = document.createElement('span')
      v.className = `s-val${gold ? ' gold' : ''}`
      v.textContent = val
      d.append(k, v)
      stats.appendChild(d)
    }
    add('SCORE', info.score.toLocaleString(), newBest)
    add('BEST', best.toLocaleString())
    add('WAVE', `${info.wave}/${TOTAL_WAVES}`)
    add('KILLS', String(info.kills))
    add('TIME', `${mm}:${ss.toString().padStart(2, '0')}`)
    if (newBest) {
      const nb = document.createElement('div')
      nb.className = 's-key new-best'
      nb.textContent = 'NEW BEST!'
      stats.appendChild(nb)
    }
  }

  syncSettings(quality: Quality, sfx: number, music: number, musicOn: boolean): void {
    const seg = document.getElementById('seg-quality')!
    for (const btn of Array.from(seg.querySelectorAll<HTMLButtonElement>('button'))) {
      btn.classList.toggle('on', btn.dataset.quality === quality)
    }
    const s = document.getElementById('vol-sfx') as HTMLInputElement
    s.value = String(Math.round(sfx * 100))
    ;(this.els.get('vol-sfx-val') as HTMLElement).textContent = s.value
    const m = document.getElementById('vol-music') as HTMLInputElement
    m.value = String(Math.round(music * 100))
    ;(this.els.get('vol-music-val') as HTMLElement).textContent = m.value
    ;(this.els.get('toggle-music') as HTMLButtonElement).textContent = musicOn ? 'ON' : 'OFF'
  }

  dispose(): void {
    for (const u of this.unbinders) u()
    this.unbinders = []
    window.clearTimeout(this.flashTimeout)
  }
}
