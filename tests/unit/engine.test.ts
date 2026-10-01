import { describe, expect, it } from 'vitest'
import { Engine } from '../../src/game/engine'
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
