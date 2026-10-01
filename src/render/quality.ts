/** Graphic quality tiers for low-spec to high-end machines. */
export type Quality = 'low' | 'medium' | 'high'

export interface QualitySettings {
  id: Quality
  pixelRatio: number
  antialias: boolean
  toneMapping: boolean
  particles: number
  stars: number
  nebula: boolean
  rings: number
}

export function qualitySettings(q: Quality): QualitySettings {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  switch (q) {
    case 'low':
      return {
        id: 'low',
        pixelRatio: Math.min(dpr, 1),
        antialias: false,
        toneMapping: false,
        particles: 600,
        stars: 1000,
        nebula: false,
        rings: 2,
      }
    case 'medium':
      return {
        id: 'medium',
        pixelRatio: Math.min(dpr, 1.5),
        antialias: true,
        toneMapping: true,
        particles: 1400,
        stars: 2000,
        nebula: true,
        rings: 3,
      }
    case 'high':
      return {
        id: 'high',
        pixelRatio: Math.min(dpr, 2),
        antialias: true,
        toneMapping: true,
        particles: 2600,
        stars: 3000,
        nebula: true,
        rings: 4,
      }
  }
}
