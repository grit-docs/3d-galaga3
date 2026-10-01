import type { EnemyDef } from '../types'

export const ENEMIES: Record<string, EnemyDef> = {
  mite: {
    id: 'mite',
    name: '마이트',
    hp: 18,
    score: 50,
    radius: 0.45,
    freq: 'pulse',
    shards: 1,
    behavior: 'swarm',
    speed: 11,
    contactDamage: 10,
  },
  husk: {
    id: 'husk',
    name: '헐크',
    hp: 26,
    score: 80,
    radius: 0.55,
    freq: 'pulse',
    shards: 1,
    behavior: 'kamikaze',
    speed: 12,
    contactDamage: 18,
  },
  lance: {
    id: 'lance',
    name: '랜스',
    hp: 40,
    score: 100,
    radius: 0.6,
    freq: 'arc',
    shards: 1,
    behavior: 'strafe',
    speed: 8,
    contactDamage: 12,
    fireInterval: 1.9,
    bulletSpeed: 17,
    bulletDamage: 8,
    bulletCount: 1,
  },
  weaver: {
    id: 'weaver',
    name: '위버',
    hp: 55,
    score: 130,
    radius: 0.7,
    freq: 'void',
    shards: 1,
    behavior: 'orbit',
    speed: 9,
    contactDamage: 12,
    fireInterval: 2.4,
    bulletSpeed: 15,
    bulletDamage: 8,
    bulletCount: 3,
    bulletSpread: 0.5,
  },
  wraith: {
    id: 'wraith',
    name: '래스',
    hp: 45,
    score: 150,
    radius: 0.6,
    freq: 'void',
    shards: 2,
    behavior: 'blink',
    speed: 7,
    contactDamage: 12,
    fireInterval: 2.6,
    bulletSpeed: 12,
    bulletDamage: 10,
    bulletCount: 1,
    homing: 1.6,
  },
  bulwark: {
    id: 'bulwark',
    name: '볼웩',
    hp: 90,
    score: 200,
    radius: 1.0,
    freq: 'pulse',
    shards: 2,
    behavior: 'push',
    speed: 3.2,
    contactDamage: 16,
    shield: 35,
  },
  // ---------------- bosses ----------------
  warden_prime: {
    id: 'warden_prime',
    name: '워든 프라임',
    hp: 700,
    score: 1500,
    radius: 2.6,
    freq: 'arc',
    shards: 4,
    behavior: 'boss',
    speed: 6,
    contactDamage: 25,
    boss: {
      hoverZ: -26,
      color: '#b478ff',
      phases: [
        { threshold: 0.66, pattern: 'spiral', interval: 0.12, arms: 3, speed: 13 },
        { threshold: 0.33, pattern: 'aimed', interval: 1.1, bullets: 3, speed: 17 },
        { threshold: 0, pattern: 'radial', interval: 1.3, bullets: 16, speed: 12, summonType: 'mite', summonCount: 2, summonEvery: 6 },
      ],
    },
  },
  warden_hex: {
    id: 'warden_hex',
    name: '워든 헥스',
    hp: 1300,
    score: 2500,
    radius: 2.9,
    freq: 'void',
    shards: 5,
    behavior: 'boss',
    speed: 6,
    contactDamage: 28,
    boss: {
      hoverZ: -27,
      color: '#ff4dd8',
      phases: [
        { threshold: 0.66, pattern: 'radial', interval: 1.4, bullets: 14, speed: 11 },
        { threshold: 0.33, pattern: 'spiral', interval: 0.1, arms: 4, speed: 14, summonType: 'weaver', summonCount: 2, summonEvery: 8 },
        { threshold: 0, pattern: 'aimed', interval: 0.9, bullets: 5, speed: 18 },
      ],
    },
  },
  null_gate: {
    id: 'null_gate',
    name: '널 게이트',
    hp: 2400,
    score: 5000,
    radius: 3.2,
    freq: 'void',
    shards: 6,
    behavior: 'boss',
    speed: 7,
    contactDamage: 30,
    boss: {
      hoverZ: -28,
      color: '#ff5470',
      phases: [
        { threshold: 0.7, pattern: 'spiral', interval: 0.09, arms: 5, speed: 15 },
        { threshold: 0.45, pattern: 'radial', interval: 1.2, bullets: 22, speed: 12, summonType: 'husk', summonCount: 2, summonEvery: 7 },
        { threshold: 0.2, pattern: 'aimed', interval: 0.8, bullets: 4, speed: 19 },
        { threshold: 0, pattern: 'spiral', interval: 0.08, arms: 6, speed: 16, summonType: 'wraith', summonCount: 1, summonEvery: 9 },
      ],
    },
  },
}

export function enemyDef(id: string): EnemyDef {
  const def = ENEMIES[id]
  if (!def) throw new Error(`unknown enemy: ${id}`)
  return def
}

/** per-wave HP scaling so later waves stay threatening */
export function waveHpScale(waveIndex: number): number {
  return 1 + 0.18 * waveIndex
}

/** per-wave enemy bullet damage scaling */
export function waveDmgScale(waveIndex: number): number {
  return 1 + 0.06 * waveIndex
}
