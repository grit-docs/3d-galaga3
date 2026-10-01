import { describe, expect, it } from 'vitest'
import { Engine } from '../../src/game/engine'
import { WEAPONS } from '../../src/game/data/weapons'
import type { Bullet } from '../../src/game/types'
import { STEP, aimAt, godMode, makeEngine } from './helpers'

function fireOnce(e: Engine, weaponId: string): Bullet[] {
  e.player.weapons = [{ defId: weaponId, cooldown: 0 }]
  e.player.weaponSlot = 0
  e.input.firing = true
  e.step(STEP)
  e.input.firing = false
  const bullets = e.bullets.filter((b) => b.friendly)
  e.bullets = e.bullets.filter((b) => !b.friendly)
  return bullets
}

describe('Weapons', () => {
  it('every weapon definition is complete', () => {
    for (const id of Object.keys(WEAPONS)) {
      const w = WEAPONS[id]
      expect(w.damage).toBeGreaterThan(0)
      expect(w.interval).toBeGreaterThan(0)
      expect(w.speed).toBeGreaterThan(0)
      expect(w.projectiles).toBeGreaterThanOrEqual(1)
      expect(['pulse', 'arc', 'void']).toContain(w.freq)
      expect(w.weave.duration).toBeGreaterThan(0)
    }
  })

  it('fires the expected projectile count per volley', () => {
    const e = makeEngine()
    godMode(e)
    const counts: Record<string, number> = {}
    for (const id of Object.keys(WEAPONS)) {
      const bullets = fireOnce(e, id)
      counts[id] = bullets.length
    }
    expect(counts.pulse).toBe(1)
    expect(counts.arc).toBe(1)
    expect(counts.void).toBe(1)
    expect(counts.bloom).toBe(WEAPONS.bloom.projectiles)
  })

  it('damage scale applies (mods.damageMul)', () => {
    const e = makeEngine()
    godMode(e)
    const before = fireOnce(e, 'pulse')
    expect(before.length).toBe(1)
    const base = before[0].damage
    e.mods.damageMul = 2
    const after = fireOnce(e, 'pulse')
    expect(after[0].damage).toBeCloseTo(base * 2)
  })

  it('arc weapon chains to nearby enemies', () => {
    const e = makeEngine()
    godMode(e)
    e.player.weapons = [{ defId: 'arc', cooldown: 0 }]
    e.player.weaponSlot = 0
    const a = e.spawnEnemy('mite', { x: 0, y: 0, z: -12 })
    const b = e.spawnEnemy('mite', { x: 1.5, y: 0, z: -12 })
    a.state = 'active'
    b.state = 'active'
    aimAt(e, a.pos)
    e.input.firing = true
    for (let i = 0; i < 60; i++) {
      e.step(STEP)
      if ((a.state as string) === 'dying' && (b.state as string) === 'dying') break
    }
    // both should have been hit (direct + chain)
    expect(a.state).toBe('dying')
    expect(b.state).toBe('dying')
    const evs = e.events
    expect(evs.some((x) => x.type === 'lightning' && x.points.length >= 2)).toBe(true)
  })

  it('void lance pierces through enemies', () => {
    const e = makeEngine()
    godMode(e)
    e.debugClearWave() // keep the lane clear of queue spawns
    e.player.weapons = [{ defId: 'void', cooldown: 0 }]
    e.player.weaponSlot = 0
    // two enemies on the same line; the bulwark's shield (35) soaks 4 void
    // hits (30 * 0.25 each) before breaking and letting hp take damage
    const a = e.spawnEnemy('mite', { x: 0, y: 0, z: -12 })
    a.state = 'active'
    const b = e.spawnEnemy('bulwark', { x: 0, y: 0, z: -20 })
    b.state = 'active'
    aimAt(e, a.pos)
    e.input.firing = true
    for (let i = 0; i < 600; i++) {
      e.step(STEP)
      if (b.hp < b.maxHp) break
    }
    expect(a.state).toBe('dying')
    expect(b.hp).toBeLessThan(b.maxHp) // bullet continued and hit the second enemy
  })

  it('bulwark shield resists non-pulse frequencies', () => {
    const e = makeEngine()
    godMode(e)
    const mk = (weapon: string) => {
      const en = e.spawnEnemy('bulwark', { x: 0, y: 0, z: -12 })
      en.state = 'active'
      e.player.weapons = [{ defId: weapon, cooldown: 0 }]
      e.player.weaponSlot = 0
      aimAt(e, en.pos)
      e.input.firing = true
      e.step(STEP)
      e.input.firing = false
      // let the single bullet connect
      for (let i = 0; i < 30; i++) e.step(STEP)
      return en
    }
    const byPulse = mk('pulse')
    const pulseShieldLoss = byPulse.maxShield - byPulse.shield
    const byVoid = mk('void')
    const voidShieldLoss = byVoid.maxShield - byVoid.shield
    expect(pulseShieldLoss).toBeGreaterThan(voidShieldLoss)
  })
})
