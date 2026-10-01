import { Engine } from '../../src/game/engine'
import type { Vec3 } from '../../src/game/types'
import { normalize, v3 } from '../../src/game/vec'

export const STEP = 1 / 60

export function makeEngine(seed = 1): Engine {
  const e = new Engine(seed)
  e.begin()
  return e
}

export function godMode(e: Engine): void {
  e.player.maxHp = 1_000_000
  e.player.hp = 1_000_000
  e.player.maxShield = 1_000_000
  e.player.shield = 1_000_000
}

export function aimAt(e: Engine, target: Vec3): void {
  const p = e.player.pos
  e.input.aim = normalize(v3(target.x - p.x, target.y - p.y, target.z - p.z))
}

/** Run the simulation for `seconds`, auto-aiming at the first enemy and firing. */
export function simulate(e: Engine, seconds: number, killAll = true): void {
  const steps = Math.ceil(seconds / STEP)
  for (let i = 0; i < steps; i++) {
    const target = e.enemies.find((en) => en.state === 'active')
    e.input.firing = target !== undefined
    if (target) aimAt(e, target.pos)
    e.step(STEP)
    if (killAll) {
      for (const en of e.enemies) {
        if (en.state === 'active') e.damageEnemy(en, 99999, 'pulse', false)
      }
    }
  }
  e.input.firing = false
}

export function drainEvents(e: Engine) {
  return e.events.splice(0)
}
