import type { Rarity, UpgradeDef } from '../types'

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  rare: 30,
  epic: 10,
}

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'dmg',
    name: '레조넌스 앰플리파이어',
    desc: '모든 무기 대미지 +25%',
    rarity: 'common',
    effect: { kind: 'damage', mul: 1.25 },
  },
  {
    id: 'rate',
    name: '캐패시터 오버클록',
    desc: '발사 속도 +15%',
    rarity: 'common',
    effect: { kind: 'fireRate', mul: 1.15 },
  },
  {
    id: 'proj',
    name: '스플릿 배럴',
    desc: '발사 탄수 +1 (최대 2회)',
    rarity: 'rare',
    max: 2,
    effect: { kind: 'projectiles', add: 1 },
  },
  {
    id: 'pierce',
    name: '페이즈 라운드',
    desc: '탄의 관통 수 +1',
    rarity: 'rare',
    effect: { kind: 'pierce', add: 1 },
  },
  {
    id: 'speed',
    name: '스러스터 튜닝',
    desc: '이동 속도 +15%',
    rarity: 'common',
    effect: { kind: 'speed', mul: 1.15 },
  },
  {
    id: 'hp',
    name: '헐 플레이팅',
    desc: '최대 체력 +25, 즉시 25 회복',
    rarity: 'common',
    effect: { kind: 'hp', add: 25, heal: 25 },
  },
  {
    id: 'shield',
    name: '에이지 필드',
    desc: '최대 시ールド +25, 시ールド 전체 회복',
    rarity: 'common',
    effect: { kind: 'shield', add: 25, refill: true },
  },
  {
    id: 'regen',
    name: '나노 리페어',
    desc: '4초 동안 피격이 없으면 시ールド가 1.2/초 회복',
    rarity: 'rare',
    once: true,
    effect: { kind: 'regen' },
  },
  {
    id: 'magnet',
    name: '샤드 마그네트',
    desc: '파편 흡수 반경 +75%',
    rarity: 'common',
    effect: { kind: 'magnet', mul: 1.75 },
  },
  {
    id: 'combo',
    name: '플레이밍 스트릭',
    desc: '콤보 유지 시간 +1초',
    rarity: 'common',
    effect: { kind: 'combo', add: 1 },
  },
  {
    id: 'weave',
    name: '위브 레조넌스',
    desc: '위브 스테이트 지속 시간 +3초',
    rarity: 'rare',
    effect: { kind: 'weave', add: 3 },
  },
  {
    id: 'crit',
    name: '크리티컬 하모닉',
    desc: '15% 확률로 2배 대미지 (최대 2회)',
    rarity: 'rare',
    max: 2,
    effect: { kind: 'crit', chance: 0.15 },
  },
  {
    id: 'weapon_arc',
    name: 'ARC WEAVE 해금',
    desc: '체인 라이트닝 무기 ARC WEAVE를 장착한다. ARC 적의 조각으로 위브를 채울 수 있다.',
    rarity: 'epic',
    once: true,
    effect: { kind: 'weapon', weapon: 'arc' },
  },
  {
    id: 'weapon_void',
    name: 'VOID LANCE 해금',
    desc: '고관통 대미지 무기 VOID LANCE를 장착한다. 위브 시 관통 지점에서 폭발한다.',
    rarity: 'epic',
    once: true,
    effect: { kind: 'weapon', weapon: 'void' },
  },
  {
    id: 'weapon_bloom',
    name: 'BLOOM SCATTER 해금',
    desc: '광역 산탄 무기 BLOOM SCATTER를 장착한다. 근접 swarm에 강력하다.',
    rarity: 'epic',
    once: true,
    effect: { kind: 'weapon', weapon: 'bloom' },
  },
  {
    id: 'bomb',
    name: '노바 서지',
    desc: 'R 키: 적탄을 전부 소거하고 적 전체에 40 대미지 (런당 1회)',
    rarity: 'epic',
    once: true,
    effect: { kind: 'bomb' },
  },
  {
    id: 'repair',
    name: '응급 수리',
    desc: '체력과 시ールド를 즉시 전량 회복',
    rarity: 'common',
    effect: { kind: 'repair' },
  },
]

export function upgradeDef(id: string): UpgradeDef {
  const def = UPGRADES.find((u) => u.id === id)
  if (!def) throw new Error(`unknown upgrade: ${id}`)
  return def
}
