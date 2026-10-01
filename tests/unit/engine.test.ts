import { describe, expect, it } from 'vitest'
import { Engine } from '../../src/game/engine'
import { weaponDef } from '../../src/game/data/weapons'
import { STEP, aimAt, drainEvents, godMode, makeEngine } from './helpers'

describe('Engine core flow', () => {
  it('starts in menu and begins wave 1', () => {
    const e = new Engine(3)
    expect(e.state).toBe('menu')
    e.begin()
    expect(e.state).toBe('playing')
    expect(e.waveIndex).toBe(0)
    const evs = drainEvents(e)
    expect(evs.some((x) => x.type === 'waveStart' && x.index === 0)).toBe(true)
  })

  it('fires bullets when input is firing', () => {
    const e = makeEngine()
    e.input.firing = true
    for (let i = 0; i < 30; i++) e.step(STEP)
    const friendly = e.bullets.filter((b) => b.friendly)
    expect(friendly.length).toBeGreaterThan(0)
    expect(e.events.some((x) => x.type === 'shot')).toBe(true)
  })

  it('does not step while paused states', () => {
    const e = makeEngine()
    const t0 = e.time
    e.state = 'upgrade'
    e.step(STEP)
    expect(e.time).toBe(t0)
  })

  it('kills enemies, awards score and drops shards', () => {
    const e = makeEngine()
    godMode(e)
    e.debugClearWave() // drop the wave 1 spawn queue so only our target exists
    const en = e.spawnEnemy('mite', { x: 0, y: 0, z: -15 })
    en.state = 'active'
    aimAt(e, en.pos)
    e.input.firing = true
    for (let i = 0; i < 240; i++) {
      e.step(STEP)
      if (e.enemies.length === 0) break
    }
    expect(e.enemies.length).toBe(0)
    expect(e.kills).toBe(1)
    expect(e.score).toBeGreaterThan(0)
    expect(e.shards.length).toBe(1)
    const evs = drainEvents(e)
    expect(evs.some((x) => x.type === 'enemyDeath')).toBe(true)
  })

  it('player takes damage: shield first, then hp; death ends run', () => {
    const e = makeEngine()
    const p = e.player
    p.shield = 10
    p.hp = 10
    p.invuln = 0
    e.damagePlayer(8)
    expect(p.shield).toBe(2)
    expect(p.hp).toBe(10)
    p.invuln = 0
    e.damagePlayer(3)
    expect(p.shield).toBe(0)
    expect(p.hp).toBe(9)
    p.invuln = 0
    e.damagePlayer(999)
    expect(p.hp).toBe(0)
    expect(p.dead).toBe(true)
    for (let i = 0; i < 120; i++) e.step(STEP)
    expect(e.state).toBe('gameover')
    expect(drainEvents(e).some((x) => x.type === 'gameOver' && x.victory === false)).toBe(true)
  })

  it('invulnerability window blocks damage', () => {
    const e = makeEngine()
    const p = e.player
    p.invuln = 0.6
    e.damagePlayer(50)
    expect(p.hp).toBe(p.maxHp)
  })

  it('phase shift dashes and applies slow-mo cooldown', () => {
    const e = makeEngine()
    e.lastMoveDir = { x: 1, y: 0, z: 0 }
    e.tryPhase()
    expect(e.player.phaseActive).toBeGreaterThan(0)
    expect(e.player.phaseCd).toBeGreaterThan(0)
    e.tryPhase()
    // cooldown still active: no second dash
    expect(e.player.phaseCd).toBeGreaterThan(0)
  })

  it('weave charges from shards and activates with Q', () => {
    const e = makeEngine()
    e.debugAddShard('pulse')
    e.debugAddShard('pulse')
    e.debugAddShard('pulse')
    for (let i = 0; i < 30; i++) e.step(STEP) // let magnet pull shards in
    expect(e.player.weave.pulse).toBe(3)
    e.tryWeave()
    expect(e.player.weave.pulse).toBe(0)
    expect(e.player.weaveActive.pulse).toBeGreaterThan(0)
    expect(e.events.some((x) => x.type === 'weave' && x.freq === 'pulse')).toBe(true)
  })

  it('weave cannot activate without a full meter', () => {
    const e = makeEngine()
    e.debugAddShard('arc')
    for (let i = 0; i < 30; i++) e.step(STEP)
    expect(e.player.weave.arc).toBe(1)
    e.tryWeave()
    expect(e.player.weaveActive.arc).toBe(0)
  })

  it('bomb clears enemy bullets and damages enemies', () => {
    const e = makeEngine()
    godMode(e)
    e.mods.bomb = 1
    const en = e.spawnEnemy('lance', { x: 0, y: 0, z: -20 })
    en.state = 'active'
    const hpBefore = en.hp
    // fake an enemy bullet near the player
    e.bullets.push({
      id: 900000,
      pos: { x: 0, y: 0, z: -2 },
      vel: { x: 0, y: 0, z: 1 },
      radius: 0.3,
      damage: 8,
      freq: 'void',
      friendly: false,
      pierce: 0,
      life: 5,
      homing: 0,
      hitIds: [],
      aoe: 0,
      chain: undefined,
      crit: false,
    })
    e.tryBomb()
    expect(e.bullets.every((b) => b.friendly)).toBe(true)
    expect(e.mods.bomb).toBe(0)
    expect(en.hp).toBeLessThan(hpBefore)
  })

  it('is deterministic: same seed + same input = same result', () => {
    const a = makeEngine(2024)
    const b = makeEngine(2024)
    godMode(a)
    godMode(b)
    const run = (e: Engine) => {
      for (let i = 0; i < 60 * 12; i++) {
        const t = e.enemies.find((en) => en.state === 'active')
        e.input.move.x = Math.sin(i * 0.01)
        e.input.move.y = Math.cos(i * 0.013)
        e.input.firing = t !== undefined
        if (t) aimAt(e, t.pos)
        e.step(STEP)
        if (e.state === 'upgrade') e.chooseUpgrade(e.upgradeChoices![0].id)
      }
    }
    run(a)
    run(b)
    expect(a.score).toBe(b.score)
    expect(a.kills).toBe(b.kills)
    expect(a.bullets.length).toBe(b.bullets.length)
    expect(a.waveIndex).toBe(b.waveIndex)
  })
})

describe('Friendly bullet collision (issue #1: close-range hits)', () => {
  // Place a single stationary enemy at z on the -Z axis in front of the
  // player (at the origin) and fire straight forward. We drive fireWeapon +
  // updateBullets directly (rather than the full step loop) so enemy AI and
  // the contact-kill rule do not interfere with the bullet collision check
  // under test.
  function fireForward(z: number, frames = 10): { e: Engine; en: { id: number; hp: number } } {
    const e = makeEngine()
    godMode(e)
    e.debugClearWave()
    e.player.pos = { x: 0, y: 0, z: 0 }
    const en = e.spawnEnemy('mite', { x: 0, y: 0, z })
    en.state = 'active'
    e.input.aim = { x: 0, y: 0, z: -1 }
    const w = e.currentWeapon!
    const def = weaponDef(w.defId)
    for (let i = 0; i < frames; i++) {
      en.pos = { x: 0, y: 0, z } // pin the enemy in place
      e.fireWeapon(def, w) // fire every frame (cooldown not enforced)
      e.updateBullets(STEP, STEP)
    }
    return { e, en }
  }

  it('hits a far enemy (regression: existing behavior)', () => {
    const { en } = fireForward(-15, 24)
    expect(en.hp).toBeLessThan(18) // mite base hp is 18
  })

  it('hits a close enemy in front of the player (issue #1)', () => {
    // enemy sits between the player and the 1.2-unit bullet spawn offset
    const { en } = fireForward(-0.6, 6)
    expect(en.hp).toBeLessThan(18)
  })

  it('hits an enemy at several close ranges', () => {
    for (const z of [-0.4, -0.8, -1.0, -1.5]) {
      const { en } = fireForward(z, 6)
      expect(en.hp, `z=${z}`).toBeLessThan(18)
    }
  })

  it('a single forward bullet registers a hit even when it spawns beyond the enemy', () => {
    const e = makeEngine()
    godMode(e)
    e.debugClearWave()
    const en = e.spawnEnemy('mite', { x: 0, y: 0, z: -0.6 })
    en.state = 'active'
    const hpBefore = en.hp
    e.input.aim = { x: 0, y: 0, z: -1 }
    const w = e.currentWeapon!
    e.fireWeapon(weaponDef(w.defId), w)
    e.updateBullets(STEP, STEP)
    // the swept test must catch the enemy even though the bullet spawned at
    // z≈-1.2 (behind the enemy) and moved away during this frame
    expect(en.hp).toBeLessThan(hpBefore)
  })

  it('does not re-hit the same enemy with a pierce bullet', () => {
    const e = makeEngine()
    godMode(e)
    e.debugClearWave()
    const en = e.spawnEnemy('mite', { x: 0, y: 0, z: -0.6 })
    en.state = 'active'
    const w = e.currentWeapon!
    // give the pulse bullet 1 pierce so it survives the first impact
    e.mods.pierceAdd = 1
    const dmg = 8 // pulse base damage
    e.input.aim = { x: 0, y: 0, z: -1 }
    e.fireWeapon(weaponDef(w.defId), w)
    e.updateBullets(STEP, STEP)
    // exactly one hit on this single enemy for this single bullet
    expect(en.hp).toBe(18 - dmg)
  })

  it('a fast bullet that skips past the enemy in one frame still hits', () => {
    const e = makeEngine()
    godMode(e)
    e.debugClearWave()
    e.bulletAssist = 0 // keep the bullet on a straight line
    const en = e.spawnEnemy('mite', { x: 0, y: 0, z: -2 })
    en.state = 'active'
    // hit radius = 0.22 (bullet) + 0.45 (mite) + 0.35 (slack) = 1.02
    // start at z=-0.8 (1.2 away, just outside) and move 2.4 in one frame
    // (vel 144 * STEP), ending at z=-3.2 (1.2 away on the far side).
    // Endpoint-only checks miss it; the swept test catches the crossing.
    e.bullets.push({
      id: 999_001,
      pos: { x: 0, y: 0, z: -0.8 },
      vel: { x: 0, y: 0, z: -144 },
      radius: 0.22,
      damage: 8,
      freq: 'pulse',
      friendly: true,
      pierce: 0,
      life: 10,
      homing: 0,
      hitIds: [],
      aoe: 0,
      chain: undefined,
      crit: false,
    })
    const hpBefore = en.hp
    e.updateBullets(STEP, STEP)
    expect(en.hp).toBeLessThan(hpBefore)
  })
})
