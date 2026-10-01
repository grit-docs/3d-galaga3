/**
 * Fully procedural WebAudio: synth SFX + generative ambient music loop.
 * No external samples. AudioContext is created lazily on first user gesture.
 */

export interface SoundSettings {
  sfx: number // 0..1
  music: number // 0..1
  musicOn: boolean
}

const SCALES = [
  [220, 261.63, 293.66, 329.63, 392, 440], // A minor penta
  [196, 233.08, 261.63, 293.66, 349.23, 392], // G minor penta
  [174.61, 207.65, 233.08, 261.63, 311.13, 349.23], // F minor penta
]

export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private musicTimer: number | null = null
  private droneOscs: OscillatorNode[] = []
  private droneLfo: OscillatorNode | null = null
  private droneChain: AudioNode[] = []
  private nextNoteTime = 0
  private step = 0
  private scale: number[] = SCALES[0]
  private settings: SoundSettings = { sfx: 0.8, music: 0.55, musicOn: true }
  private lastShoot = 0

  setSettings(s: SoundSettings): void {
    this.settings = { ...s }
    if (this.sfxGain) this.sfxGain.gain.value = s.sfx
    if (this.musicGain) this.musicGain.gain.value = s.musicOn ? s.music * 0.5 : 0
  }

  get isRunning(): boolean {
    return this.ctx !== null
  }

  /** must be called from a user gesture */
  init(seed = 0): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(this.ctx.destination)
    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = this.settings.sfx
    this.sfxGain.connect(this.master)
    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = this.settings.musicOn ? this.settings.music * 0.5 : 0
    this.musicGain.connect(this.master)
    // noise buffer
    const len = this.ctx.sampleRate
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    // deterministic scale choice from seed
    this.scale = SCALES[seed % SCALES.length]
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  // ------------------------------------------------------------- SFX

  play(name: string): void {
    if (!this.ctx || !this.sfxGain) return
    const t = this.now()
    switch (name) {
      case 'shoot': {
        if (t - this.lastShoot < 0.03) return
        this.lastShoot = t
        this.blip(660 + Math.random() * 120, 'square', 0.05, 0.12, 1.6)
        break
      }
      case 'hit':
        this.noiseBurst(0.05, 2400, 0.18)
        break
      case 'explosion':
        this.noiseBurst(0.4, 700, 0.5)
        this.blip(110, 'sine', 0.35, 0.4, 0.35)
        break
      case 'bigexplosion':
        this.noiseBurst(0.8, 400, 0.7)
        this.blip(70, 'sine', 0.7, 0.6, 0.3)
        break
      case 'pickup':
        this.blip(740, 'sine', 0.07, 0.2)
        this.blip(1180, 'sine', 0.09, 0.2, 0.05)
        break
      case 'hurt':
        this.blip(180, 'sawtooth', 0.25, 0.4, 0.4)
        break
      case 'phase':
        this.noiseBurst(0.25, 1200, 0.3, 0.02)
        this.blip(300, 'sine', 0.25, 0.2, 3)
        break
      case 'weave':
        this.blip(880, 'sine', 0.3, 0.2, 1.4)
        this.blip(1320, 'sine', 0.35, 0.16, 1.6)
        this.blip(1760, 'sine', 0.4, 0.12, 1.8)
        break
      case 'bomb':
        this.noiseBurst(0.9, 500, 0.8)
        this.blip(60, 'sine', 0.8, 0.7, 0.25)
        break
      case 'ui':
        this.blip(520, 'triangle', 0.05, 0.15)
        break
      case 'waveclear':
        this.blip(523, 'triangle', 0.12, 0.22)
        this.blip(659, 'triangle', 0.12, 0.22, 0.1)
        this.blip(784, 'triangle', 0.18, 0.22, 0.2)
        break
      case 'bossalert':
        this.blip(82, 'sawtooth', 0.7, 0.35, 0.9)
        this.blip(82, 'sawtooth', 0.7, 0.3, 0.9, 0.25)
        break
      default:
        break
    }
  }

  private blip(freq: number, type: OscillatorType, dur: number, gain: number, glide = 1, delay = 0): void {
    if (!this.ctx || !this.sfxGain) return
    const t = this.now() + delay
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(this.sfxGain)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private noiseBurst(dur: number, cutoff: number, gain: number, delay = 0): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuf) return
    const t = this.now() + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff * 3, t)
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutoff * 0.4), t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter)
    filter.connect(g)
    g.connect(this.sfxGain)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  // ------------------------------------------------------------- music

  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return
    this.nextNoteTime = this.now() + 0.1
    this.step = 0
    this.musicTimer = window.setInterval(() => this.schedule(), 100)
    this.startDrone()
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer)
      this.musicTimer = null
    }
    for (const osc of this.droneOscs) {
      try {
        osc.stop()
      } catch {
        // already stopped
      }
    }
    this.droneOscs = []
    if (this.droneLfo) {
      try {
        this.droneLfo.stop()
      } catch {
        // already stopped
      }
      this.droneLfo = null
    }
    for (const node of this.droneChain) node.disconnect()
    this.droneChain = []
  }

  private startDrone(): void {
    if (!this.ctx || !this.musicGain) return
    const t = this.now()
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.12, t + 2)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 260
    const lfo = this.ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoGain = this.ctx.createGain()
    lfoGain.gain.value = 120
    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)
    lfo.start(t)
    this.droneLfo = lfo
    const f0 = this.scale[0] / 2
    for (const f of [f0, f0 * 1.5, f0 * 2.02]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = f
      const og = this.ctx.createGain()
      og.gain.value = 0.3
      osc.connect(og)
      og.connect(filter)
      osc.start(t)
      this.droneOscs.push(osc)
    }
    filter.connect(g)
    g.connect(this.musicGain)
    this.droneChain = [lfoGain, lfo, filter, g]
  }

  private schedule(): void {
    if (!this.ctx || !this.musicGain) return
    const ahead = this.now() + 0.25
    const stepDur = 0.32
    while (this.nextNoteTime < ahead) {
      const t = this.nextNoteTime
      // arp note
      if (this.step % 2 === 0) {
        const note = this.scale[(this.step / 2) % this.scale.length]
        const up = this.step % 16 >= 8 ? 2 : 1
        const osc = this.ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = note * up
        const g = this.ctx.createGain()
        g.gain.setValueAtTime(0.09, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 1.6)
        osc.connect(g)
        g.connect(this.musicGain)
        osc.start(t)
        osc.stop(t + stepDur * 1.7)
      }
      // soft kick
      if (this.step % 4 === 0) {
        const osc = this.ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(90, t)
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.12)
        const g = this.ctx.createGain()
        g.gain.setValueAtTime(0.22, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
        osc.connect(g)
        g.connect(this.musicGain)
        osc.start(t)
        osc.stop(t + 0.16)
      }
      this.nextNoteTime += stepDur
      this.step = (this.step + 1) % 32
    }
  }

  dispose(): void {
    this.stopMusic()
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
    }
    this.master = null
    this.sfxGain = null
    this.musicGain = null
    this.noiseBuf = null
  }
}
