import { describe, expect, it } from 'vitest'
import { makeEngine } from './helpers'
import { STEP } from './helpers'

function killN(e: ReturnType<typeof makeEngine>, n: number): void {
  for (let i = 0; i < n; i++) {
    const en = e.spawnEnemy('mite', { x: (i % 5) * 2, y: 0, z: -12 })
    en.state = 'active'
    e.damageEnemy(en, 99999, 'pulse', false)
  }
}

describe('Scoring and combo', () => {
  it('combo multiplier grows with consecutive kills', () => {
    const e = makeEngine()
    e.player.maxHp = 1e9
    e.player.hp = 1e9
    expect(e.multiplier).toBe(1)
    killN(e, 1)
    expect(e.multiplier).toBeCloseTo(1.1)
    killN(e, 4) // total 5
    expect(e.multiplier).toBeCloseTo(1.5)
  })

  it('combo multiplier is capped at 8x', () => {
    const e = makeEngine()
    e.player.maxHp = 1e9
    e.player.hp = 1e9
    killN(e, 80)
    expect(e.multiplier).toBe(8)
  })

  it('combo resets after the window expires', () => {
    const e = makeEngine()
    e.player.maxHp = 1e9
    e.player.hp = 1e9
    killN(e, 3)
    expect(e.comboCount).toBe(3)
    // step longer than the default 3s window without kills
    for (let i = 0; i < 60 * 4; i++) e.step(STEP)
    expect(e.comboCount).toBe(0)
    expect(e.multiplier).toBe(1)
  })

  it('combo window upgrade extends decay', () => {
    const e = makeEngine()
    e.mods.comboWindow += 2 // +2s via upgrade
    e.player.maxHp = 1e9
    e.player.hp = 1e9
    killN(e, 2)
    // 3.5s > base 3s but < 3s + 2s
    for (let i = 0; i < 60 * 3.5; i++) e.step(STEP)
    expect(e.comboCount).toBe(2)
  })

  it('best score updates on game over and flags newBest', () => {
    const e = makeEngine()
    e.bestScore = 0
    killN(e, 2)
    const scoreBefore = e.score
    expect(scoreBefore).toBeGreaterThan(0)
    // kill the player
    e.player.invuln = 0
    e.damagePlayer(999999)
    for (let i = 0; i < 120; i++) e.step(STEP)
    expect(e.state).toBe('gameover')
    expect(e.bestScore).toBe(scoreBefore)
    expect(e.newBest).toBe(true)
  })

  it('wave clear bonus is added to score', () => {
    const e = makeEngine()
    e.player.maxHp = 1e9
    e.player.hp = 1e9
    e.bullets = []
    e.enemies = []
    ;(e as unknown as { spawnQueue: unknown[] }).spawnQueue = []
    const before = e.score
    e.step(STEP)
    expect(e.state).toBe('upgrade')
    expect(e.score).toBe(before + 500 * 1)
  })
})
