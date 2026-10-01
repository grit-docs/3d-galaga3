import { RNG, randomSeed } from './rng'
import { clamp, dist, normalize, sub, v3 } from './vec'
import type {
  Bullet,
  Enemy,
  EnemyDef,
  Formation,
  GameEvent,
  GameState,
  Mods,
  PlayerState,
  Shard,
  UpgradeDef,
  Vec3,
  WeaponDef,
  WeaponInstance,
  WaveDef,
  Frequency,
} from './types'
import { ARENA, ENEMY_SPAWN_Z, WEAVE_CAP } from './types'
import { enemyDef, waveDmgScale, waveHpScale } from './data/enemies'
import { weaponDef } from './data/weapons'
import { RARITY_WEIGHTS, UPGRADES } from './data/upgrades'
import { TOTAL_WAVES, WAVES } from './data/waves'

export interface InputState {
  move: { x: number; y: number }
  aim: Vec3
  firing: boolean
}

interface SpawnJob {
  t: number
  type: string
  pos: Vec3
}

const PLAYER_MAX_SPEED = 14
const PHASE_DURATION = 0.45
const PHASE_COOLDOWN = 4
const PHASE_DASH_SPEED = 26
const SLOW_FACTOR = 0.35
const SHIELD_REGEN_DELAY = 4
const SHIELD_REGEN_RATE = 1.2
const SHIELD_REDUCE_FACTOR = 0.25
const BOMB_DAMAGE = 40
const COMBO_BASE_WINDOW = 3
const COMBO_STEP = 0.1
const COMBO_MAX = 8

function defaultMods(): Mods {
  return {
    damageMul: 1,
    fireRateMul: 1,
    projectilesAdd: 0,
    pierceAdd: 0,
    speedMul: 1,
    magnetMul: 1,
    comboWindow: COMBO_BASE_WINDOW,
    weaveDurationAdd: 0,
    critChance: 0,
    regen: false,
    bomb: 0,
  }
}

function makePlayer(): PlayerState {
  return {
    pos: v3(0, 0, 0),
    vel: v3(0, 0, 0),
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    invuln: 0,
    phaseCd: 0,
    phaseActive: 0,
    weaponSlot: 0,
    weapons: [{ defId: 'pulse', cooldown: 0 }],
    weave: { pulse: 0, arc: 0, void: 0 },
    weaveActive: { pulse: 0, arc: 0, void: 0 },
    timeSinceHit: 99,
    dead: false,
  }
}

export class Engine {
  readonly seed: number
  state: GameState = 'menu'
  time = 0
  score = 0
  kills = 0
  bestScore = 0
  newBest = false
  waveIndex = -1
  comboCount = 0
  mods: Mods = defaultMods()
  player: PlayerState = makePlayer()
  bullets: Bullet[] = []
  enemies: Enemy[] = []
  shards: Shard[] = []
  events: GameEvent[] = []
  upgradeChoices: UpgradeDef[] | null = null
  upgradesTaken = new Map<string, number>()
  input: InputState = { move: { x: 0, y: 0 }, aim: v3(0, 0, -1), firing: false }
  lastMoveDir = v3(1, 0, 0)
  /** Seconds-scale steering strength for friendly bullet magnetism. */
  bulletAssist = 0.28
  /** Per-second angular rate multiplier applied on top of bulletAssist. */
  assistRate = 14
  /** Steering cone half-angle (radians) for bullet assist. */
  assistCone = 0.35
  /** Extra collision slack (world units) added to friendly bullet hit radius. */
  hitSlack = 0.35

  private rng: RNG
  private nextId = 1
  private spawnQueue: SpawnJob[] = []
  private waveTime = 0
  private waveCleared = false
  private comboTimer = 0
  private deathTimer = 0

  constructor(seed?: number) {
    this.seed = seed ?? randomSeed()
    this.rng = new RNG(this.seed)
  }

  get multiplier(): number {
    return Math.min(COMBO_MAX, 1 + this.comboCount * COMBO_STEP)
  }

  get currentWeapon(): WeaponInstance | null {
    return this.player.weapons[this.player.weaponSlot] ?? null
  }

  get waveDef(): WaveDef | null {
    return this.waveIndex >= 0 ? WAVES[this.waveIndex] : null
  }

  /** Return to the title menu, clearing all run entities. */
  toMenu(): void {
    this.state = 'menu'
    this.bullets = []
    this.enemies = []
    this.shards = []
    this.spawnQueue = []
    this.upgradeChoices = null
    this.events = []
    this.player = makePlayer()
  }

  /**
   * Direction of the best enemy target for the given bullet, or null.
   * Candidates must sit inside a forward steering cone and be roughly ahead.
   * Returns the enemy (for velocity lead) rather than a bare position.
   */
  private assistTarget(b: Bullet): Enemy | null {
    if (b.hitIds.length > 0) return null // don't re-steer after a pierce hit
    const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z)
    if (speed < 1e-4) return null
    const fx = b.vel.x / speed
    const fy = b.vel.y / speed
    const fz = b.vel.z / speed
    let best: Enemy | null = null
    let bestD = Infinity
    for (const e of this.enemies) {
      if (e.state !== 'active') continue
      const dx = e.pos.x - b.pos.x
      const dy = e.pos.y - b.pos.y
      const dz = e.pos.z - b.pos.z
      const d = Math.hypot(dx, dy, dz)
      if (d < 0.5 || d > 34) continue
      const dot = (dx * fx + dy * fy + dz * fz) / d
      // radius/d grows with range so far-away wide targets stay catchable
      if (dot < Math.cos(this.assistCone + e.defRadius / Math.max(d, 1))) continue
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  /** Begin (or restart) a run. */
  begin(): void {
    this.rng = new RNG(this.seed)
    this.nextId = 1
    this.state = 'playing'
    this.time = 0
    this.score = 0
    this.kills = 0
    this.newBest = false
    this.comboCount = 0
    this.comboTimer = 0
    this.mods = defaultMods()
    this.player = makePlayer()
    this.bullets = []
    this.enemies = []
    this.shards = []
    this.upgradeChoices = null
    this.upgradesTaken = new Map()
    this.events = []
    this.input.firing = false
    this.startWave(0)
  }

  /** Start wave i (0-based). Emits waveStart event. */
  startWave(i: number): void {
    const def = WAVES[i]
    this.waveIndex = i
    this.waveTime = 0
    this.waveCleared = false
    this.spawnQueue = []
    for (const entry of def.spawns) {
      for (let k = 0; k < entry.count; k++) {
        const t = entry.delay + k * entry.interval
        const pos = this.formationPos(entry.formation, k, entry.count)
        this.spawnQueue.push({ t, type: entry.type, pos })
      }
    }
    if (def.boss) {
      this.spawnQueue.push({ t: 1.5, type: def.boss, pos: v3(0, 0, ENEMY_SPAWN_Z + 6) })
      this.events.push({ type: 'bossAlert', name: enemyDef(def.boss).name })
    }
    this.spawnQueue.sort((a, b) => a.t - b.t)
    this.events.push({ type: 'waveStart', index: i, label: def.label, boss: def.boss ?? null })
  }

  /** Spawn position for formation slot k of count (deterministic per run). */
  formationPos(formation: Formation, k: number, count: number): Vec3 {
    const z = ENEMY_SPAWN_Z
    const jx = () => this.rng.range(-1.2, 1.2)
    switch (formation) {
      case 'line': {
        const x = -10 + (20 * (k + 0.5)) / count
        return v3(x, this.rng.range(-1, 1), z)
      }
      case 'v': {
        const off = k - (count - 1) / 2
        return v3(off * 3.2 + jx() * 0.5, -Math.abs(off) * 1.1, z)
      }
      case 'flank': {
        const side = k % 2 === 0 ? -1 : 1
        return v3(side * (8 + this.rng.range(0, 3)), this.rng.range(-3, 3), z)
      }
      case 'ring': {
        const a = (Math.PI * 2 * k) / count
        return v3(Math.cos(a) * 8, Math.sin(a) * 4.5, z)
      }
      case 'stream':
      default:
        return v3(jx(), this.rng.range(-1.5, 1.5), z)
    }
  }

  /** Fixed-step simulation update. */
  step(dt: number): void {
    if (this.state !== 'playing') return
    this.time += dt
    this.waveTime += dt
    const p = this.player
    if (p.dead) {
      this.deathTimer -= dt
      this.updateShards(dt)
      if (this.deathTimer <= 0) this.finishRun(false)
      return
    }
    const edt = dt * (p.phaseActive > 0 ? SLOW_FACTOR : 1)
    this.updatePlayer(dt)
    this.processSpawns()
    this.updateEnemies(edt)
    this.updateBullets(dt, edt)
    this.updateShards(dt)
    this.updateCombo(dt)
    this.checkWaveEnd()
  }

  // ------------------------------------------------------------- player

  updatePlayer(dt: number): void {
    const p = this.player
    p.phaseCd = Math.max(0, p.phaseCd - dt)
    p.invuln = Math.max(0, p.invuln - dt)
    p.timeSinceHit += dt
    for (const f of ['pulse', 'arc', 'void'] as const) {
      p.weaveActive[f] = Math.max(0, p.weaveActive[f] - dt)
    }

    const mv = this.input.move
    const ml = Math.hypot(mv.x, mv.y)
    if (ml > 0.1) {
      this.lastMoveDir = v3(mv.x / ml, mv.y / ml, 0)
    }
    if (p.phaseActive > 0) {
      p.phaseActive -= dt
      const decay = 1 - 2.5 * dt
      p.vel.x *= decay
      p.vel.y *= decay
    } else {
      const maxSpeed = PLAYER_MAX_SPEED * this.mods.speedMul
      const tx = ml > 0 ? (mv.x / ml) * maxSpeed : 0
      const ty = ml > 0 ? (mv.y / ml) * maxSpeed : 0
      const k = 1 - Math.exp(-8 * dt)
      p.vel.x += (tx - p.vel.x) * k
      p.vel.y += (ty - p.vel.y) * k
    }
    p.pos.x = clamp(p.pos.x + p.vel.x * dt, -ARENA.x, ARENA.x)
    p.pos.y = clamp(p.pos.y + p.vel.y * dt, -ARENA.y, ARENA.y)
    p.pos.z = clamp(p.pos.z, ARENA.zMin, ARENA.zMax)

    if (this.mods.regen && p.timeSinceHit > SHIELD_REGEN_DELAY) {
      p.shield = Math.min(p.maxShield, p.shield + SHIELD_REGEN_RATE * dt)
    }

    const w = this.currentWeapon
    if (!w) return
    const def = weaponDef(w.defId)
    w.cooldown -= dt
    if (this.input.firing && w.cooldown <= 0) {
      this.fireWeapon(def, w)
    }
  }

  fireWeapon(def: WeaponDef, w: WeaponInstance): void {
    const weaving = this.player.weaveActive[def.freq] > 0
    const weave = def.weave
    const n = Math.max(1, def.projectiles + this.mods.projectilesAdd + (weaving ? weave.projectilesAdd : 0))
    const spread = def.spread + (weaving ? weave.spreadAdd : 0)
    const dmg = def.damage * this.mods.damageMul * (weaving ? weave.damageMul : 1)
    const pierce = def.pierce + this.mods.pierceAdd + (weaving ? weave.pierceAdd : 0)
    const aoe = weaving ? weave.aoe : 0
    const chain = def.chain
      ? {
          count: def.chain.count + (weaving ? weave.chainAdd : 0),
          range: def.chain.range + (weaving ? weave.chainRangeAdd : 0),
          falloff: def.chain.falloff,
          used: 0,
        }
      : undefined
    const aim = this.input.aim
    // perpendicular axis for fan spread (world-up projected out of aim)
    const side = v3(aim.y, -aim.x, 0)
    const sl = Math.hypot(side.x, side.y)
    if (sl > 1e-4) {
      side.x /= sl
      side.y /= sl
    } else {
      side.x = 1
      side.y = 0
    }
    const origin = v3(
      this.player.pos.x + aim.x * 1.2,
      this.player.pos.y + aim.y * 1.2,
      this.player.pos.z + aim.z * 1.2,
    )
    for (let i = 0; i < n; i++) {
      const theta = n > 1 ? (i / (n - 1) - 0.5) * spread : 0
      const dir = normalize(
        v3(
          aim.x * Math.cos(theta) + side.x * Math.sin(theta),
          aim.y * Math.cos(theta) + side.y * Math.sin(theta),
          aim.z * Math.cos(theta),
        ),
      )
      this.bullets.push({
        id: this.nextId++,
        pos: v3(origin.x, origin.y, origin.z),
        vel: v3(dir.x * def.speed, dir.y * def.speed, dir.z * def.speed),
        radius: def.radius,
        damage: dmg,
        freq: def.freq,
        friendly: true,
        pierce,
        life: def.life,
        homing: 0,
        hitIds: [],
        aoe,
        chain,
        crit: this.rng.chance(this.mods.critChance),
      })
    }
    w.cooldown = def.interval / this.mods.fireRateMul
    this.events.push({ type: 'shot', freq: def.freq })
  }

  selectWeapon(i: number): void {
    if (this.state !== 'playing' && this.state !== 'upgrade') return
    if (i >= 0 && i < this.player.weapons.length) {
      this.player.weaponSlot = i
    }
  }

  tryPhase(): void {
    if (this.state !== 'playing' || this.player.dead) return
    if (this.player.phaseCd > 0) return
    const d = this.lastMoveDir
    const dl = Math.hypot(d.x, d.y)
    const dir = dl > 0.1 ? v3(d.x, d.y, 0) : v3(this.input.aim.x, this.input.aim.y, 0)
    const nl = Math.hypot(dir.x, dir.y)
    if (nl < 0.1) {
      dir.x = 1
      dir.y = 0
    } else {
      dir.x /= nl
      dir.y /= nl
    }
    const p = this.player
    p.phaseActive = PHASE_DURATION
    p.phaseCd = PHASE_COOLDOWN
    p.invuln = Math.max(p.invuln, 0.35)
    p.vel.x = dir.x * PHASE_DASH_SPEED
    p.vel.y = dir.y * PHASE_DASH_SPEED
    this.events.push({ type: 'phase' })
  }

  tryWeave(): void {
    if (this.state !== 'playing' || this.player.dead) return
    const w = this.currentWeapon
    if (!w) return
    const def = weaponDef(w.defId)
    const f = def.freq
    const p = this.player
    if (p.weave[f] < WEAVE_CAP || p.weaveActive[f] > 0) return
    p.weave[f] = 0
    p.weaveActive[f] = def.weave.duration + this.mods.weaveDurationAdd
    this.events.push({ type: 'weave', freq: f, pos: v3(p.pos.x, p.pos.y, p.pos.z) })
  }

  tryBomb(): void {
    if (this.state !== 'playing' || this.player.dead) return
    if (this.mods.bomb <= 0) return
    this.mods.bomb = 0
    for (const b of this.bullets) {
      if (!b.friendly) this.events.push({ type: 'explosion', pos: v3(b.pos.x, b.pos.y, b.pos.z), size: 0.5, color: '#ffb45e' })
    }
    this.bullets = this.bullets.filter((b) => b.friendly)
    for (const e of [...this.enemies]) {
      if (e.state === 'active') this.damageEnemy(e, BOMB_DAMAGE, 'pulse', false)
    }
    this.events.push({ type: 'bomb' })
  }

  // ------------------------------------------------------------- enemies

  spawnEnemy(typeId: string, pos: Vec3): Enemy {
    const def = enemyDef(typeId)
    const hpScale = def.boss ? 1 : waveHpScale(this.waveIndex)
    const hp = Math.round(def.hp * hpScale)
    const e: Enemy = {
      id: this.nextId++,
      defId: typeId,
      pos: v3(pos.x, pos.y, pos.z),
      vel: v3(0, 0, 0),
      hp,
      maxHp: hp,
      shield: def.shield ?? 0,
      maxShield: def.shield ?? 0,
      state: 'spawn',
      stateTimer: 0.5,
      fireTimer: def.fireInterval ? def.fireInterval * 0.7 : 0,
      spawnT: this.time,
      phase: this.rng.range(0, Math.PI * 2),
      spiralAngle: this.rng.range(0, Math.PI * 2),
      summonTimer: def.boss?.phases[0]?.summonEvery ?? 0,
      bossPhaseIdx: 0,
      hitFlash: 0,
      score: def.score,
      defRadius: def.radius,
    }
    if (def.behavior === 'kamikaze') {
      const dir = normalize(v3(this.player.pos.x - pos.x, this.player.pos.y - pos.y, this.player.pos.z - pos.z))
      e.vel.x = dir.x * def.speed
      e.vel.y = dir.y * def.speed
      e.vel.z = dir.z * def.speed
    }
    this.enemies.push(e)
    return e
  }

  processSpawns(): void {
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].t <= this.waveTime) {
      const job = this.spawnQueue.shift()
      if (job) this.spawnEnemy(job.type, job.pos)
    }
  }

  updateEnemies(edt: number): void {
    const alive: Enemy[] = []
    for (const e of this.enemies) {
      const def = enemyDef(e.defId)
      e.hitFlash = Math.max(0, e.hitFlash - edt)
      if (e.state === 'spawn') {
        e.stateTimer -= edt
        if (e.stateTimer <= 0) e.state = 'active'
        alive.push(e)
        continue
      }
      if (e.state === 'dying') {
        e.stateTimer -= edt
        if (e.stateTimer <= 0) continue
        alive.push(e)
        continue
      }
      this.updateEnemyBehavior(e, def, edt)
      // cull: enemies that drift far behind the player
      if (e.pos.z > 14) continue
      alive.push(e)
    }
    this.enemies = alive
  }

  updateEnemyBehavior(e: Enemy, def: EnemyDef, edt: number): void {
    const p = this.player
    const t = this.time + e.phase * 10
    switch (def.behavior) {
      case 'swarm': {
        const dir = normalize(v3(p.pos.x - e.pos.x, p.pos.y - e.pos.y, p.pos.z - e.pos.z))
        // gentler weave than before: easier to lead and hit
        const wob = Math.sin(t * 1.6) * 1.6
        e.vel.x = dir.x * def.speed
        e.vel.y = dir.y * def.speed + Math.cos(t * 1.9) * wob * 0.3
        e.vel.z = dir.z * def.speed
        e.pos.x += e.vel.x * edt
        e.pos.y += e.vel.y * edt
        e.pos.z += e.vel.z * edt
        if (dist(e.pos, p.pos) < def.radius + 0.8) {
          this.killEnemy(e, false)
          this.damagePlayer(def.contactDamage)
        }
        break
      }
      case 'kamikaze': {
        e.pos.x += e.vel.x * edt
        e.pos.y += e.vel.y * edt
        e.pos.z += e.vel.z * edt
        if (dist(e.pos, p.pos) < def.radius + 0.9) {
          this.killEnemy(e, false)
          this.damagePlayer(def.contactDamage)
        }
        break
      }
      case 'strafe': {
        const tx = Math.sin(t * 0.7) * 9
        const ty = p.pos.y * 0.5 + Math.sin(t * 0.9) * 1.5
        const tz = -22 + Math.sin(t * 0.5) * 3
        const k = 1 - Math.exp(-2 * edt)
        e.vel.x = (tx - e.pos.x) * k * def.speed * 0.2
        e.vel.y = (ty - e.pos.y) * k * def.speed * 0.2
        e.vel.z = (tz - e.pos.z) * k * def.speed * 0.2
        e.pos.x += (tx - e.pos.x) * k
        e.pos.y += (ty - e.pos.y) * k
        e.pos.z += (tz - e.pos.z) * k
        e.fireTimer -= edt
        if (e.fireTimer <= 0) {
          e.fireTimer = def.fireInterval ?? 2
          this.fireAtPlayer(e, def, 1, 0)
        }
        break
      }
      case 'orbit': {
        const cx = p.pos.x
        const cy = p.pos.y
        const cz = p.pos.z - 16
        e.phase += edt * 0.8
        const tx = cx + Math.cos(e.phase) * 9
        const ty = cy + Math.sin(e.phase) * 5.5
        const k = 1 - Math.exp(-3 * edt)
        e.pos.x += (tx - e.pos.x) * k
        e.pos.y += (ty - e.pos.y) * k
        e.pos.z += (cz - e.pos.z) * k
        e.fireTimer -= edt
        if (e.fireTimer <= 0) {
          e.fireTimer = def.fireInterval ?? 2.4
          this.fireAtPlayer(e, def, def.bulletCount ?? 1, def.bulletSpread ?? 0)
        }
        break
      }
      case 'push': {
        const dir = normalize(v3(p.pos.x * 0.7 - e.pos.x, p.pos.y * 0.7 - e.pos.y, p.pos.z - e.pos.z))
        e.vel.x = dir.x * def.speed
        e.vel.y = dir.y * def.speed
        e.vel.z = dir.z * def.speed
        e.pos.x += e.vel.x * edt
        e.pos.y += e.vel.y * edt
        e.pos.z += e.vel.z * edt
        if (dist(e.pos, p.pos) < def.radius + 0.9) {
          this.killEnemy(e, false)
          this.damagePlayer(def.contactDamage)
        }
        break
      }
      case 'blink': {
        e.summonTimer -= edt
        if (e.summonTimer <= 0) {
          e.summonTimer = 1.6
          e.pos.x = clamp(p.pos.x + this.rng.range(-9, 9), -ARENA.x, ARENA.x)
          e.pos.y = clamp(p.pos.y + this.rng.range(-5, 5), -ARENA.y, ARENA.y)
          e.pos.z = this.rng.range(-24, -12)
          e.hitFlash = 0.35
        }
        e.fireTimer -= edt
        if (e.fireTimer <= 0) {
          e.fireTimer = def.fireInterval ?? 2.6
          this.fireAtPlayer(e, def, 1, 0, def.homing ?? 0)
        }
        break
      }
      case 'boss': {
        this.updateBoss(e, def, edt)
        break
      }
    }
    // generic boss / heavy contact (non-boss handled above)
    if (def.boss && dist(e.pos, p.pos) < def.radius + 1.1) {
      this.damagePlayer(def.contactDamage)
    }
  }

  updateBoss(e: Enemy, def: EnemyDef, edt: number): void {
    const boss = def.boss
    if (!boss) return
    const t = this.time
    const hx = Math.sin(t * 0.5 + e.phase) * 9
    const hy = Math.sin(t * 0.73 + e.phase) * 3
    const hz = boss.hoverZ + Math.sin(t * 0.31 + e.phase) * 2
    const k = 1 - Math.exp(-2 * edt)
    e.pos.x += (hx - e.pos.x) * k
    e.pos.y += (hy - e.pos.y) * k
    e.pos.z += (hz - e.pos.z) * k

    const frac = e.hp / e.maxHp
    let idx = 0
    for (let i = 0; i < boss.phases.length; i++) {
      if (frac >= boss.phases[i].threshold) idx = i
    }
    if (idx !== e.bossPhaseIdx) {
      e.bossPhaseIdx = idx
      e.fireTimer = boss.phases[idx].interval
      this.events.push({ type: 'explosion', pos: v3(e.pos.x, e.pos.y, e.pos.z), size: 2, color: boss.color })
    }
    const phase = boss.phases[idx]
    e.spiralAngle += edt * 1.6
    e.fireTimer -= edt
    if (e.fireTimer <= 0) {
      e.fireTimer = phase.interval
      this.bossPattern(e, def, phase.pattern, phase.bullets ?? 1, phase.arms ?? 3, phase.speed ?? 14)
    }
    if (phase.summonType && phase.summonEvery) {
      e.summonTimer -= edt
      if (e.summonTimer <= 0) {
        e.summonTimer = phase.summonEvery
        for (let i = 0; i < (phase.summonCount ?? 1); i++) {
          const pos = v3(
            clamp(e.pos.x + this.rng.range(-6, 6), -ARENA.x, ARENA.x),
            clamp(e.pos.y + this.rng.range(-4, 4), -ARENA.y, ARENA.y),
            e.pos.z - 4,
          )
          this.spawnEnemy(phase.summonType, pos)
        }
      }
    }
  }

  bossPattern(e: Enemy, def: EnemyDef, pattern: string, bullets: number, arms: number, speed: number): void {
    const scale = waveDmgScale(this.waveIndex)
    const fire = (dir: Vec3, homing = 0) => {
      const d = normalize(v3(dir.x, dir.y, dir.z))
      this.bullets.push({
        id: this.nextId++,
        pos: v3(e.pos.x, e.pos.y, e.pos.z),
        vel: v3(d.x * speed, d.y * speed, d.z * speed),
        radius: 0.3,
        damage: (def.bulletDamage ?? 10) * scale,
        freq: def.freq,
        friendly: false,
        pierce: 0,
        life: 8,
        homing,
        hitIds: [],
        aoe: 0,
        chain: undefined,
        crit: false,
      })
    }
    if (pattern === 'spiral') {
      for (let a = 0; a < arms; a++) {
        const ang = e.spiralAngle + (a * Math.PI * 2) / arms
        fire(v3(Math.sin(ang), Math.cos(ang) * 0.35, 1))
      }
    } else if (pattern === 'radial') {
      for (let b = 0; b < bullets; b++) {
        const ang = (b * Math.PI * 2) / bullets + e.spiralAngle * 0.3
        fire(v3(Math.sin(ang), Math.cos(ang) * 0.5, 1))
      }
    } else if (pattern === 'aimed') {
      const base = normalize(sub(v3(), this.player.pos, e.pos))
      for (let b = 0; b < bullets; b++) {
        const off = (b - (bullets - 1) / 2) * 0.22
        const c = Math.cos(off)
        const s = Math.sin(off)
        fire(v3(base.x * c - base.y * s, base.x * s + base.y * c, base.z * c))
      }
    } else if (pattern === 'summon' && def.boss) {
      // pure summon phase: handled via summonEvery, but fire one ring as fallback
      for (let b = 0; b < 8; b++) {
        const ang = (b * Math.PI * 2) / 8
        fire(v3(Math.sin(ang), Math.cos(ang) * 0.5, 1))
      }
    }
  }

  fireAtPlayer(e: Enemy, def: EnemyDef, count: number, spread: number, homing = 0): void {
    const scale = waveDmgScale(this.waveIndex)
    const base = normalize(sub(v3(), this.player.pos, e.pos))
    const step = count > 1 ? spread / (count - 1) : 0
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * step + this.rng.range(-0.02, 0.02)
      const c = Math.cos(off)
      const s = Math.sin(off)
      const dir = normalize(
        v3(base.x * c - base.y * s + this.rng.range(-0.03, 0.03), base.x * s + base.y * c + this.rng.range(-0.03, 0.03), base.z * c),
      )
      this.bullets.push({
        id: this.nextId++,
        pos: v3(e.pos.x, e.pos.y, e.pos.z),
        vel: v3(dir.x * (def.bulletSpeed ?? 15), dir.y * (def.bulletSpeed ?? 15), dir.z * (def.bulletSpeed ?? 15)),
        radius: 0.26,
        damage: (def.bulletDamage ?? 8) * scale,
        freq: def.freq,
        friendly: false,
        pierce: 0,
        life: 8,
        homing,
        hitIds: [],
        aoe: 0,
        chain: undefined,
        crit: false,
      })
    }
  }

  damageEnemy(e: Enemy, dmg: number, freq: Frequency, crit: boolean): number {
    if (e.state !== 'active') return 0
    let dealt = 0
    if (e.shield > 0) {
      const toShield = freq === 'pulse' ? dmg : dmg * SHIELD_REDUCE_FACTOR
      const absorbed = Math.min(e.shield, toShield)
      e.shield -= absorbed
      dealt = absorbed
      e.shield = Math.max(0, e.shield)
    }
    if (e.shield <= 0) {
      e.hp -= dmg
      dealt = dmg
    }
    e.hitFlash = 0.12
    this.events.push({ type: 'enemyHit', pos: v3(e.pos.x, e.pos.y, e.pos.z), freq, crit })
    if (e.hp <= 0) {
      this.killEnemy(e, true)
    }
    return dealt
  }

  killEnemy(e: Enemy, awardScore: boolean): void {
    if (e.state === 'dying') return
    e.state = 'dying'
    e.stateTimer = 0.25
    const def = enemyDef(e.defId)
    this.events.push({
      type: 'explosion',
      pos: v3(e.pos.x, e.pos.y, e.pos.z),
      size: def.radius * 1.6 + (def.boss ? 3 : 0),
      color: def.boss ? def.boss.color : '#ff8a5e',
    })
    if (awardScore) {
      this.comboCount += 1
      this.comboTimer = this.mods.comboWindow
      const gained = Math.round(e.score * this.multiplier)
      this.score += gained
      this.kills += 1
      this.events.push({ type: 'enemyDeath', pos: v3(e.pos.x, e.pos.y, e.pos.z), color: '#ffb45e', score: gained, big: !!def.boss })
      for (let i = 0; i < def.shards; i++) {
        this.shards.push({
          id: this.nextId++,
          pos: v3(e.pos.x + this.rng.range(-0.6, 0.6), e.pos.y + this.rng.range(-0.6, 0.6), e.pos.z),
          vel: v3(this.rng.range(-4, 4), this.rng.range(-4, 4), this.rng.range(-2, 2)),
          freq: def.freq,
          life: 12,
        })
      }
    }
  }

  damagePlayer(dmg: number): void {
    const p = this.player
    if (p.dead || p.invuln > 0) return
    p.timeSinceHit = 0
    let rest = dmg
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, rest)
      p.shield -= absorbed
      rest -= absorbed
    }
    p.hp -= rest
    p.invuln = 0.6
    this.events.push({ type: 'playerHit', pos: v3(p.pos.x, p.pos.y, p.pos.z) })
    if (p.hp <= 0) {
      p.hp = 0
      p.dead = true
      this.deathTimer = 1.5
      this.events.push({ type: 'explosion', pos: v3(p.pos.x, p.pos.y, p.pos.z), size: 3.5, color: '#4df3ff' })
    }
  }

  // ------------------------------------------------------------- bullets

  updateBullets(dt: number, edt: number): void {
    const p = this.player
    const keep: Bullet[] = []
    for (const b of this.bullets) {
      const step = b.friendly ? dt : edt
      b.life -= step
      // aim assist: friendly bullets steer toward the best target in their
      // flight cone, leading its motion so moving enemies still connect.
      if (b.friendly && this.bulletAssist > 0 && b.homing === 0) {
        const target = this.assistTarget(b)
        if (target) {
          const cur = Math.hypot(b.vel.x, b.vel.y, b.vel.z) || 1
          const tx = target.pos.x - b.pos.x
          const ty = target.pos.y - b.pos.y
          const tz = target.pos.z - b.pos.z
          const d = Math.hypot(tx, ty, tz) || 1
          // lead the target by its velocity over the bullet's remaining flight time
          const tof = Math.min(d / Math.max(cur, 1), 1.2)
          const px = tx + target.vel.x * tof
          const py = ty + target.vel.y * tof
          const pz = tz + target.vel.z * tof
          const lead = Math.hypot(px, py, pz) || 1
          const desired = v3(px / lead, py / lead, pz / lead)
          const k = Math.min(1, this.bulletAssist * this.assistRate * step)
          const vx = b.vel.x + (desired.x * cur - b.vel.x) * k
          const vy = b.vel.y + (desired.y * cur - b.vel.y) * k
          const vz = b.vel.z + (desired.z * cur - b.vel.z) * k
          const l = Math.hypot(vx, vy, vz) || 1
          b.vel.x = (vx / l) * cur
          b.vel.y = (vy / l) * cur
          b.vel.z = (vz / l) * cur
        }
      }
      if (b.homing > 0) {
        const desired = normalize(sub(v3(), p.pos, b.pos))
        const cur = Math.hypot(b.vel.x, b.vel.y, b.vel.z) || 1
        const k = Math.min(1, b.homing * step)
        const vx = b.vel.x + (desired.x * cur - b.vel.x) * k
        const vy = b.vel.y + (desired.y * cur - b.vel.y) * k
        const vz = b.vel.z + (desired.z * cur - b.vel.z) * k
        const l = Math.hypot(vx, vy, vz) || 1
        b.vel.x = (vx / l) * cur
        b.vel.y = (vy / l) * cur
        b.vel.z = (vz / l) * cur
      }
      b.pos.x += b.vel.x * step
      b.pos.y += b.vel.y * step
      b.pos.z += b.vel.z * step

      let dead = b.life <= 0 || b.pos.z > 10 || b.pos.z < -64 || Math.abs(b.pos.x) > 34 || Math.abs(b.pos.y) > 18
      if (!dead && b.friendly) {
        for (const e of this.enemies) {
          if (e.state !== 'active' || b.hitIds.includes(e.id)) continue
          const def = enemyDef(e.defId)
          if (dist(b.pos, e.pos) < b.radius + def.radius + this.hitSlack) {
            b.hitIds.push(e.id)
            this.damageEnemy(e, b.damage * (b.crit ? 2 : 1), b.freq, b.crit)
            if (b.chain) {
              this.chainLightning(b, e.pos)
            }
            if (b.aoe > 0) {
              this.aoeBlast(b.pos, b.aoe, b.damage * 0.5, b.freq, e.id)
              this.events.push({ type: 'explosion', pos: v3(b.pos.x, b.pos.y, b.pos.z), size: b.aoe * 0.45, color: '#ff4dd8' })
            }
            if (b.pierce > 0) {
              b.pierce -= 1
            } else {
              dead = true
            }
            break
          }
        }
      } else if (!dead && !b.friendly && !p.dead) {
        if (p.invuln <= 0 && dist(b.pos, p.pos) < b.radius + 0.7) {
          this.damagePlayer(b.damage)
          dead = true
        }
      }
      if (!dead) keep.push(b)
    }
    this.bullets = keep
  }

  chainLightning(b: Bullet, from: Vec3): void {
    if (!b.chain) return
    const chain = b.chain
    if (chain.used >= chain.count) return
    const targets: { e: Enemy; d: number }[] = []
    for (const e of this.enemies) {
      if (e.state !== 'active' || b.hitIds.includes(e.id)) continue
      targets.push({ e, d: dist(e.pos, from) })
    }
    targets.sort((a, b2) => a.d - b2.d)
    const points: Vec3[] = [v3(from.x, from.y, from.z)]
    for (let i = 0; i < Math.min(chain.count - chain.used, targets.length); i++) {
      const t = targets[i]
      if (t.d > chain.range) break
      chain.used += 1
      b.hitIds.push(t.e.id)
      const dmg = b.damage * Math.pow(chain.falloff, i + 1)
      this.damageEnemy(t.e, dmg, b.freq, false)
      points.push(v3(t.e.pos.x, t.e.pos.y, t.e.pos.z))
    }
    if (points.length > 1) {
      this.events.push({ type: 'lightning', points })
    }
  }

  aoeBlast(pos: Vec3, radius: number, dmg: number, freq: Frequency, excludeId: number): void {
    for (const e of this.enemies) {
      if (e.state !== 'active' || e.id === excludeId) continue
      if (dist(e.pos, pos) < radius) {
        this.damageEnemy(e, dmg, freq, false)
      }
    }
  }

  // ------------------------------------------------------------- shards / combo

  updateShards(dt: number): void {
    const p = this.player
    const keep: Shard[] = []
    const range = 2.5 * this.mods.magnetMul
    for (const s of this.shards) {
      s.life -= dt
      if (s.life <= 0) continue
      s.pos.x += s.vel.x * dt
      s.pos.y += s.vel.y * dt
      s.pos.z += s.vel.z * dt
      const d = dist(s.pos, p.pos)
      if (!p.dead && d < range) {
        const dir = normalize(sub(v3(), p.pos, s.pos))
        const pull = 10 + (1 - d / range) * 26
        s.vel.x = dir.x * pull
        s.vel.y = dir.y * pull
        s.vel.z = dir.z * pull
      }
      if (!p.dead && d < 1.1) {
        p.weave[s.freq] = Math.min(WEAVE_CAP, p.weave[s.freq] + 1)
        this.events.push({ type: 'shardPickup', pos: v3(s.pos.x, s.pos.y, s.pos.z), freq: s.freq, full: p.weave[s.freq] === WEAVE_CAP })
        continue
      }
      keep.push(s)
    }
    this.shards = keep
  }

  updateCombo(dt: number): void {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.comboCount = 0
    }
  }

  // ------------------------------------------------------------- wave / run flow

  checkWaveEnd(): void {
    if (this.waveCleared) return
    if (this.spawnQueue.length > 0) return
    if (this.enemies.length > 0) return
    this.waveCleared = true
    this.score += 500 * (this.waveIndex + 1)
    this.events.push({ type: 'waveClear', index: this.waveIndex })
    if (this.waveIndex >= TOTAL_WAVES - 1) {
      this.score += 5000
      this.finishRun(true)
    } else {
      this.state = 'upgrade'
      this.upgradeChoices = this.rollUpgrades(3)
    }
  }

  rollUpgrades(n: number): UpgradeDef[] {
    const pool = UPGRADES.filter((u) => {
      const effect = u.effect
      const taken = this.upgradesTaken.get(u.id) ?? 0
      if (u.once && taken >= 1) return false
      if (u.max && taken >= u.max) return false
      if (effect.kind === 'weapon') {
        if (this.player.weapons.some((w) => w.defId === effect.weapon)) return false
        if (this.player.weapons.length >= 3) return false
      }
      return true
    })
    const chosen: UpgradeDef[] = []
    const weights = pool.map((u) => RARITY_WEIGHTS[u.rarity])
    while (chosen.length < n && pool.length > 0) {
      const idx = this.rng.weighted(pool.map((_, i) => i), weights)
      chosen.push(pool[idx])
      pool.splice(idx, 1)
      weights.splice(idx, 1)
    }
    return chosen
  }

  chooseUpgrade(id: string): void {
    if (this.state !== 'upgrade' || !this.upgradeChoices) return
    const def = this.upgradeChoices.find((u) => u.id === id)
    if (!def) return
    const count = this.upgradesTaken.get(id) ?? 0
    this.upgradesTaken.set(id, count + 1)
    const p = this.player
    switch (def.effect.kind) {
      case 'damage':
        this.mods.damageMul *= def.effect.mul
        break
      case 'fireRate':
        this.mods.fireRateMul *= def.effect.mul
        break
      case 'projectiles':
        this.mods.projectilesAdd += def.effect.add
        break
      case 'pierce':
        this.mods.pierceAdd += def.effect.add
        break
      case 'speed':
        this.mods.speedMul *= def.effect.mul
        break
      case 'hp':
        p.maxHp += def.effect.add
        p.hp = Math.min(p.maxHp, p.hp + def.effect.heal)
        break
      case 'shield':
        p.maxShield += def.effect.add
        if (def.effect.refill) p.shield = p.maxShield
        break
      case 'regen':
        this.mods.regen = true
        break
      case 'magnet':
        this.mods.magnetMul *= def.effect.mul
        break
      case 'combo':
        this.mods.comboWindow += def.effect.add
        break
      case 'weave':
        this.mods.weaveDurationAdd += def.effect.add
        break
      case 'crit':
        this.mods.critChance = Math.min(0.5, this.mods.critChance + def.effect.chance)
        break
      case 'weapon':
        if (p.weapons.length < 3) {
          p.weapons.push({ defId: def.effect.weapon, cooldown: 0 })
        }
        break
      case 'bomb':
        this.mods.bomb = 1
        break
      case 'repair':
        p.hp = p.maxHp
        p.shield = p.maxShield
        break
    }
    this.upgradeChoices = null
    this.state = 'playing'
    this.startWave(this.waveIndex + 1)
  }

  finishRun(victory: boolean): void {
    if (this.state === 'gameover') return
    this.state = 'gameover'
    if (this.score > this.bestScore) {
      this.bestScore = this.score
      this.newBest = true
    }
    this.events.push({
      type: 'gameOver',
      victory,
      score: this.score,
      wave: this.waveIndex + 1,
      kills: this.kills,
      time: this.time,
    })
  }

  // ------------------------------------------------------------- debug / tests

  debugKillPlayer(): void {
    this.player.invuln = 0
    this.player.dead = false
    this.damagePlayer(99999)
  }

  debugClearWave(): void {
    this.enemies = []
    this.spawnQueue = []
    this.bullets = this.bullets.filter((b) => b.friendly)
  }

  debugAddShard(freq: Frequency): void {
    this.shards.push({
      id: this.nextId++,
      pos: v3(this.player.pos.x, this.player.pos.y + 2, this.player.pos.z),
      vel: v3(0, 0, 0),
      freq,
      life: 12,
    })
  }
}
