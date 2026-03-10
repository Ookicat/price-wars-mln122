export const GAME_CONFIG = {
  INITIAL_CASH: 1000,
  PRODUCTION_COST_NORMAL: 10,
  PRODUCTION_COST_PATENT: 5,
  UNITS_PER_STOCK: 100,
  PATENT_COST: 600,
  WIN_CONDITION: 5000,
  ROUND_DURATION_SECONDS: 90,
  ROUND_3_PRICE_CEILING: 50,
  MIN_PRICE_NORMAL: 11,
  MIN_PRICE_PATENT: 6,
} as const

export const COOKIE_BRANDS = ['OREO', 'Magic', 'ChocoPie', 'Solite'] as const
export type CookieBrand = (typeof COOKIE_BRANDS)[number]

export function getRandomBrand(): CookieBrand {
  return COOKIE_BRANDS[Math.floor(Math.random() * COOKIE_BRANDS.length)]
}

export function getRoundNumber(status: string): number {
  if (status.includes('ROUND_1')) return 1
  if (status.includes('ROUND_2')) return 2
  if (status.includes('ROUND_3')) return 3
  return 0
}

export function calculateDemand(
  roundNumber: number,
  totalPlayers: number,
  patentHolders: number
): number {
  switch (roundNumber) {
    case 1:
      const baseDemand = (totalPlayers * 100) / 2;
      return Math.ceil(baseDemand / 100) * 100;
    case 2:
        if (patentHolders === 2) {
            return patentHolders * 100 + 100
        }
        return patentHolders * 100 + 200
    case 3:
      return totalPlayers * 100
    default:
      return 0
  }
}
