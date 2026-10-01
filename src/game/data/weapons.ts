import type { Frequency, WeaponDef } from '../types'

/** Canonical neon color per frequency (hex string, shared by renderer & UI). */
export const FREQ_COLORS: Record<Frequency, string> = {
  pulse: '#4df3ff',
  arc: '#b478ff',
  void: '#ff4dd8',
}

export const FREQ_LABELS: Record<Frequency, string> = {
  pulse: 'PULSE',
  arc: 'ARC',
  void: 'VOID',
}

export const WEAPONS: Record<string, WeaponDef> = {
  pulse: {
    id: 'pulse',
    name: 'LUMEN PULSE',
    freq: 'pulse',
    damage: 8,
    interval: 0.16,
    speed: 48,
    projectiles: 1,
    spread: 0,
    pierce: 0,
    radius: 0.22,
    life: 1.4,
    weave: { duration: 6, damageMul: 1.0, projectilesAdd: 2, pierceAdd: 1, spreadAdd: 0.05, aoe: 0, chainAdd: 0, chainRangeAdd: 0 },
  },
  arc: {
    id: 'arc',
    name: 'ARC WEAVE',
    freq: 'arc',
    damage: 14,
    interval: 0.45,
    speed: 40,
    projectiles: 1,
    spread: 0,
    pierce: 0,
    radius: 0.26,
    life: 1.4,
    chain: { count: 3, range: 7, falloff: 0.8 },
    weave: { duration: 6, damageMul: 1.35, projectilesAdd: 0, pierceAdd: 0, spreadAdd: 0, aoe: 0, chainAdd: 3, chainRangeAdd: 4 },
  },
  void: {
    id: 'void',
    name: 'VOID LANCE',
    freq: 'void',
    damage: 30,
    interval: 0.9,
    speed: 34,
    projectiles: 1,
    spread: 0,
    pierce: 3,
    radius: 0.4,
    life: 1.6,
    weave: { duration: 6, damageMul: 1.0, projectilesAdd: 0, pierceAdd: 1, spreadAdd: 0, aoe: 4.5, chainAdd: 0, chainRangeAdd: 0 },
  },
  bloom: {
    id: 'bloom',
    name: 'BLOOM SCATTER',
    freq: 'pulse',
    damage: 6,
    interval: 0.55,
    speed: 28,
    projectiles: 6,
    spread: 0.42,
    pierce: 0,
    radius: 0.18,
    life: 0.75,
    weave: { duration: 6, damageMul: 1.15, projectilesAdd: 4, pierceAdd: 0, spreadAdd: 0.16, aoe: 0, chainAdd: 0, chainRangeAdd: 0 },
  },
}

/** order in which weapon unlock upgrades exist */
export const WEAPON_ORDER = ['pulse', 'arc', 'void', 'bloom']

export function weaponDef(id: string): WeaponDef {
  const def = WEAPONS[id]
  if (!def) throw new Error(`unknown weapon: ${id}`)
  return def
}
