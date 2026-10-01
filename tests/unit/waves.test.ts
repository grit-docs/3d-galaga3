import { describe, expect, it } from 'vitest'
import { STEP, godMode, makeEngine, simulate } from './helpers'
import { enemyDef } from '../../src/game/data/enemies'
import { WAVES } from '../../src/game/data/waves'
import type { BossPhase } from '../../src/game/types'

describe('Wave data', () => {
  it('has 9 waves with bosses on waves 3, 6, 9', () => {
    expect(WAVES.length).toBe(9)
    expect(WAVES[2].boss).toBe('warden_prime')
    expect(WAVES[5].boss).toBe('warden_hex')
    expect(WAVES[8].boss).toBe('null_gate')
    for (let i = 0; i < WAVES.length; i++) {
      if (i !== 2 && i !== 5 && i !== 8) expect(WAVES[i].boss).toBeUndefined()
    }
  })

  it('all spawn types and boss ids reference valid enemy defs', () => {
    for (const w of WAVES) {
      for (const s of w.spawns) {
        expect(enemyDef(s.type).id).toBe(s.type)
      }
      if (w.boss) expect(enemyDef(w.boss).boss).toBeTruthy()
    }
  })

  it('boss phases have strictly decreasing thresholds ending at 0', () => {
    for (const id of ['warden_prime', 'warden_hex', 'null_gate']) {
      const def = enemyDef(id)
      const phases = def.boss!.phases
      expect(phases.length).toBeGreaterThanOrEqual(2)
      let prev = 1.01
      for (const ph of phases) {
        expect(ph.threshold).toBeLessThan(prev)
        prev = ph.threshold
      }
      expect(phases[phases.length - 1].threshold).toBe(0)
      for (const ph of phases as BossPhase[]) {
        expect(['spiral', 'radial', 'aimed', 'summon']).toContain(ph.pattern)
        expect(ph.interval).toBeGreaterThan(0)
      }
    }
  })
})

describe('Full run simulation', () => {
  it('a god-mode player can clear all 9 waves and win', () => {
    const e = makeEngine(777)
    e.player.maxHp = 1e9
    e.player.hp = 1e9
    e.player.maxShield = 1e9
    e.player.shield = 1e9
    let guard = 0
    while (e.state !== 'gameover' && guard < 60 * 600) {
      simulate(e, 0.5)
      if (e.state === 'upgrade') {
        const choices = e.upgradeChoices
        expect(choices).not.toBeNull()
        e.chooseUpgrade(choices![0].id)
      }
      guard += 1
    }
    expect(e.state).toBe('gameover')
    const ev = e.events.find((x) => x.type === 'gameOver')
    expect(ev).toBeTruthy()
    expect(ev!.victory).toBe(true)
    expect(e.waveIndex).toBe(WAVES.length - 1)
    expect(e.score).toBeGreaterThan(5000)
  }, 30000)

  it('waves spawn the configured enemies (wave 1 = mites only)', () => {
    const e = makeEngine(5)
    godMode(e)
    let sawAny = false
    for (let i = 0; i < 60 * 5 && e.state === 'playing'; i++) {
      for (const en of e.enemies) {
        sawAny = true
        expect(en.defId).toBe('mite')
        if (en.state === 'active') e.damageEnemy(en, 99999, 'pulse', false)
      }
      e.step(STEP)
    }
    expect(sawAny).toBe(true)
  })
})
