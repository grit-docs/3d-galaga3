/** Core shared types for the simulation. No rendering or DOM dependencies. */

export type Frequency = 'pulse' | 'arc' | 'void'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface WeaponWeaveMods {
  duration: number
  damageMul: number
  projectilesAdd: number
  pierceAdd: number
  spreadAdd: number
  /** AoE explosion radius applied to pierced/terminal impact (0 = off) */
  aoe: number
  chainAdd: number
  chainRangeAdd: number
}

export interface WeaponDef {
  id: string
  name: string
  freq: Frequency
  damage: number
  /** seconds between volleys */
  interval: number
  speed: number
  projectiles: number
  /** total spread angle in radians */
  spread: number
  pierce: number
  radius: number
  life: number
  chain?: { count: number; range: number; falloff: number }
  weave: WeaponWeaveMods
}

export interface WeaponInstance {
  defId: string
  cooldown: number
}

export type EnemyBehavior = 'swarm' | 'strafe' | 'orbit' | 'push' | 'blink' | 'kamikaze' | 'boss'

export type BossPattern = 'spiral' | 'radial' | 'aimed' | 'summon'

export interface BossPhase {
  /** switch to this phase when hp/maxHp falls below this value */
  threshold: number
  pattern: BossPattern
  interval: number
  bullets?: number
  arms?: number
  speed?: number
  summonType?: string
  summonCount?: number
  /** seconds between summon events (for patterns that also summon) */
  summonEvery?: number
}

export interface BossDef {
  phases: BossPhase[]
  hoverZ: number
  color: string
}

export interface EnemyDef {
  id: string
  name: string
  hp: number
  score: number
  radius: number
  freq: Frequency
  shards: number
  behavior: EnemyBehavior
  speed: number
  contactDamage: number
  shield?: number
  fireInterval?: number
  bulletSpeed?: number
  bulletDamage?: number
  bulletSpread?: number
  bulletCount?: number
  homing?: number
  boss?: BossDef
}

export type Rarity = 'common' | 'rare' | 'epic'

export type UpgradeEffect =
  | { kind: 'damage'; mul: number }
  | { kind: 'fireRate'; mul: number }
  | { kind: 'projectiles'; add: number }
  | { kind: 'pierce'; add: number }
  | { kind: 'speed'; mul: number }
  | { kind: 'hp'; add: number; heal: number }
  | { kind: 'shield'; add: number; refill: boolean }
  | { kind: 'regen' }
  | { kind: 'magnet'; mul: number }
  | { kind: 'combo'; add: number }
  | { kind: 'weave'; add: number }
  | { kind: 'crit'; chance: number }
  | { kind: 'weapon'; weapon: string }
  | { kind: 'bomb' }
  | { kind: 'repair' }

export interface UpgradeDef {
  id: string
  name: string
  desc: string
  rarity: Rarity
  /** can only be taken once per run */
  once?: boolean
  max?: number
  effect: UpgradeEffect
}

export type Formation = 'stream' | 'line' | 'v' | 'flank' | 'ring'

export interface SpawnEntry {
  type: string
  count: number
  interval: number
  delay: number
  formation: Formation
}

export interface WaveDef {
  label: string
  spawns: SpawnEntry[]
  boss?: string
}

export type GameState = 'menu' | 'playing' | 'upgrade' | 'gameover'

export interface PlayerState {
  pos: Vec3
  vel: Vec3
  hp: number
  maxHp: number
  shield: number
  maxShield: number
  invuln: number
  phaseCd: number
  phaseActive: number
  weaponSlot: number
  weapons: WeaponInstance[]
  /** shards collected per frequency, 0..WEAVE_CAP */
  weave: Record<Frequency, number>
  /** remaining seconds of weave state per frequency */
  weaveActive: Record<Frequency, number>
  timeSinceHit: number
  dead: boolean
}

export interface Bullet {
  id: number
  pos: Vec3
  vel: Vec3
  radius: number
  damage: number
  freq: Frequency
  friendly: boolean
  pierce: number
  life: number
  homing: number
  hitIds: number[]
  aoe: number
  chain?: { count: number; range: number; falloff: number; used: number }
  crit: boolean
}

export type EnemyState = 'spawn' | 'active' | 'dying'

export interface Enemy {
  id: number
  defId: string
  pos: Vec3
  vel: Vec3
  hp: number
  maxHp: number
  shield: number
  maxShield: number
  state: EnemyState
  stateTimer: number
  fireTimer: number
  spawnT: number
  /** behavior phase offset / orbit angle */
  phase: number
  spiralAngle: number
  summonTimer: number
  bossPhaseIdx: number
  hitFlash: number
  score: number
  /** cached EnemyDef.radius for cheap collision/aim-assist math */
  defRadius: number
}

export interface Shard {
  id: number
  pos: Vec3
  vel: Vec3
  freq: Frequency
  life: number
}

export type GameEvent =
  | { type: 'shot'; freq: Frequency }
  | { type: 'enemyHit'; pos: Vec3; freq: Frequency; crit: boolean }
  | { type: 'explosion'; pos: Vec3; size: number; color: string }
  | { type: 'enemyDeath'; pos: Vec3; color: string; score: number; big: boolean }
  | { type: 'playerHit'; pos: Vec3 }
  | { type: 'shardPickup'; pos: Vec3; freq: Frequency; full: boolean }
  | { type: 'weave'; freq: Frequency; pos: Vec3 }
  | { type: 'phase' }
  | { type: 'bomb' }
  | { type: 'lightning'; points: Vec3[] }
  | { type: 'waveStart'; index: number; label: string; boss: string | null }
  | { type: 'waveClear'; index: number }
  | { type: 'bossAlert'; name: string }
  | { type: 'gameOver'; victory: boolean; score: number; wave: number; kills: number; time: number }

export interface RunStats {
  score: number
  kills: number
  time: number
  wave: number
  victory: boolean
}

export interface Mods {
  damageMul: number
  fireRateMul: number
  projectilesAdd: number
  pierceAdd: number
  speedMul: number
  magnetMul: number
  comboWindow: number
  weaveDurationAdd: number
  critChance: number
  regen: boolean
  bomb: number
}

export const WEAVE_CAP = 3
export const ARENA = { x: 16, y: 7, zMin: -10, zMax: 6 }
export const LOGIC_STEP = 1 / 60
export const ENEMY_SPAWN_Z = -46
