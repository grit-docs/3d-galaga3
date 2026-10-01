import { describe, expect, it } from 'vitest'
import { RNG } from '../../src/game/rng'

describe('RNG', () => {
  it('is deterministic for the same seed', () => {
    const a = new RNG(1234)
    const b = new RNG(1234)
    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('differs for different seeds', () => {
    const a = new RNG(1)
    const b = new RNG(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('produces values in [0, 1)', () => {
    const r = new RNG(42)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('range/int stay within bounds', () => {
    const r = new RNG(7)
    for (let i = 0; i < 200; i++) {
      const v = r.range(2, 5)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(5)
      const n = r.int(3, 6)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(6)
    }
  })

  it('weighted picks only valid items', () => {
    const r = new RNG(99)
    const items = ['a', 'b', 'c']
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(r.weighted(items, [1, 1, 1]))
    }
  })

  it('shuffle is a permutation', () => {
    const r = new RNG(5)
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    const s = r.shuffle(arr)
    expect([...s].sort((a, b) => a - b)).toEqual(arr)
  })
})
