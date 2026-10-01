import type { WaveDef } from '../types'

/**
 * 9 waves. Waves 3 / 6 / 9 are boss waves.
 * Pacing target: one run ≈ 10–20 minutes.
 */
export const WAVES: WaveDef[] = [
  {
    label: 'HOLLOW OUTPOST',
    spawns: [
      { type: 'mite', count: 6, interval: 0.6, delay: 0, formation: 'stream' },
    ],
  },
  {
    label: 'FIRST CONTACT',
    spawns: [
      { type: 'mite', count: 6, interval: 0.5, delay: 0, formation: 'stream' },
      { type: 'lance', count: 3, interval: 1.4, delay: 3, formation: 'line' },
    ],
  },
  {
    label: 'WARDEN PRIME',
    boss: 'warden_prime',
    spawns: [
      { type: 'mite', count: 4, interval: 5, delay: 8, formation: 'flank' },
    ],
  },
  {
    label: 'ORBITAL TANGLE',
    spawns: [
      { type: 'lance', count: 4, interval: 1.2, delay: 0, formation: 'flank' },
      { type: 'weaver', count: 3, interval: 2.0, delay: 2, formation: 'v' },
    ],
  },
  {
    label: 'IRON VEIN',
    spawns: [
      { type: 'bulwark', count: 2, interval: 6, delay: 0, formation: 'flank' },
      { type: 'mite', count: 8, interval: 0.45, delay: 2, formation: 'stream' },
      { type: 'lance', count: 2, interval: 2, delay: 6, formation: 'line' },
    ],
  },
  {
    label: 'WARDEN HEX',
    boss: 'warden_hex',
    spawns: [
      { type: 'weaver', count: 3, interval: 6, delay: 10, formation: 'ring' },
      { type: 'mite', count: 4, interval: 4, delay: 4, formation: 'flank' },
    ],
  },
  {
    label: 'PHANTOM DRIFT',
    spawns: [
      { type: 'wraith', count: 3, interval: 2.5, delay: 0, formation: 'v' },
      { type: 'lance', count: 4, interval: 1.1, delay: 3, formation: 'flank' },
      { type: 'husk', count: 4, interval: 1.6, delay: 5, formation: 'stream' },
    ],
  },
  {
    label: 'COLLAPSE CHOIR',
    spawns: [
      { type: 'bulwark', count: 3, interval: 5, delay: 0, formation: 'line' },
      { type: 'wraith', count: 3, interval: 3, delay: 4, formation: 'v' },
      { type: 'husk', count: 5, interval: 1.4, delay: 6, formation: 'stream' },
      { type: 'mite', count: 6, interval: 0.5, delay: 2, formation: 'flank' },
    ],
  },
  {
    label: 'NULL GATE',
    boss: 'null_gate',
    spawns: [
      { type: 'wraith', count: 2, interval: 8, delay: 12, formation: 'flank' },
      { type: 'husk', count: 4, interval: 6, delay: 6, formation: 'flank' },
    ],
  },
]

export const TOTAL_WAVES = WAVES.length
