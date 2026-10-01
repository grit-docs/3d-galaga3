import { describe, expect, it } from 'vitest'
import { Engine } from '../../src/game/engine'
import { UPGRADES, RARITY_WEIGHTS, upgradeDef } from '../../src/game/data/upgrades'
import { WEAPONS } from '../../src/game/data/weapons'
import { makeEngine } from './helpers'

describe('Upgrade pool data', () => {
  it('every upgrade is well-formed', () => {
    expect(UPGRADES.length).toBeGreaterThanOrEqual(15)
    for (const u of UPGRADES) {
      expect(u.name.length).toBeGreaterThan(0)
      expect(u.desc.length).toBeGreaterThan(0)
      expect(['common', 'rare', 'epic']).toContain(u.rarity)
      const kind = u.effect.kind
      expect(
        [
          'damage', 'fireRate', 'projectiles', 'pierce', 'speed', 'hp', 'shield',
          'regen', 'magnet', 'combo', 'weave', 'crit', 'weapon', 'bomb', 'repair',
        ],
      ).toContain(kind)
      if (u.effect.kind === 'weapon') {
        expect(WEAPONS[u.effect.weapon]).toBeTruthy()
      }
    }
    expect(RARITY_WEIGHTS.common).toBeGreaterThan(0)
  })

  it('upgradeDef throws on unknown id', () => {
    expect(() => upgradeDef('nope')).toThrow()
  })
})

describe('Upgrade effects', () => {
  function pickFromRoll(e: Engine, id: string): void {
    e.upgradeChoices = [upgradeDef(id), upgradeDef('dmg'), upgradeDef('speed')]
    e.state = 'upgrade'
    e.chooseUpgrade(id)
  }

  it('damage / speed multipliers stack', () => {
    const e = makeEngine()
    pickFromRoll(e, 'dmg')
    expect(e.mods.damageMul).toBeCloseTo(1.25)
    pickFromRoll(e, 'dmg')
    expect(e.mods.damageMul).toBeCloseTo(1.5625)
    pickFromRoll(e, 'speed')
    expect(e.mods.speedMul).toBeCloseTo(1.15)
  })

  it('hp and shield upgrades increase max values', () => {
    const e = makeEngine()
    const hp0 = e.player.maxHp
    const sh0 = e.player.maxShield
    pickFromRoll(e, 'hp')
    expect(e.player.maxHp).toBe(hp0 + 25)
    pickFromRoll(e, 'shield')
    expect(e.player.maxShield).toBe(sh0 + 25)
    expect(e.player.shield).toBe(e.player.maxShield)
  })

  it('weapon unlock adds a weapon slot (max 3)', () => {
    const e = makeEngine()
    expect(e.player.weapons.length).toBe(1)
    pickFromRoll(e, 'weapon_arc')
    expect(e.player.weapons.length).toBe(2)
    expect(e.player.weapons[1].defId).toBe('arc')
    pickFromRoll(e, 'weapon_void')
    expect(e.player.weapons.length).toBe(3)
    // pool filtering: weapon unlocks are excluded once slots are full
    e.state = 'upgrade'
    const roll = e.rollUpgrades(3)
    expect(roll.every((u) => u.effect.kind !== 'weapon')).toBe(true)
  })

  it('once-only upgrades are excluded after being taken', () => {
    const e = makeEngine()
    pickFromRoll(e, 'regen')
    e.state = 'upgrade'
    for (let i = 0; i < 20; i++) {
      const roll = e.rollUpgrades(3)
      expect(roll.some((u) => u.id === 'regen')).toBe(false)
    }
  })

  it('repair restores hull and shield', () => {
    const e = makeEngine()
    e.player.hp = 10
    e.player.shield = 0
    pickFromRoll(e, 'repair')
    expect(e.player.hp).toBe(e.player.maxHp)
    expect(e.player.shield).toBe(e.player.maxShield)
  })

  it('rollUpgrades returns 3 unique valid choices', () => {
    const e = makeEngine()
    const roll = e.rollUpgrades(3)
    expect(roll.length).toBe(3)
    expect(new Set(roll.map((u) => u.id)).size).toBe(3)
    for (const u of roll) {
      expect(UPGRADES.some((x) => x.id === u.id)).toBe(true)
    }
  })
})
