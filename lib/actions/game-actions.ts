'use server'

import { createServerClient } from '@/lib/supabase/server'
import { GAME_CONFIG, calculateDemand } from '@/lib/types/game'
import type { RoomStatus } from '@/lib/types/database'

export async function stockUp(playerId: string, roomId: string) {
  const supabase = createServerClient()

  const { data: player, error: pErr } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()

  if (pErr || !player) throw new Error('Player not found')
  if (player.is_bankrupt) throw new Error('Player is bankrupt')
  if (player.has_stocked_up) throw new Error('Already stocked up this round')

  const costPerUnit = player.has_patent
    ? GAME_CONFIG.PRODUCTION_COST_PATENT
    : GAME_CONFIG.PRODUCTION_COST_NORMAL
  const totalCost = costPerUnit * GAME_CONFIG.UNITS_PER_STOCK

  if (player.cash < totalCost) {
    // Player cannot afford to stock up — bankrupt them
    await supabase
      .from('players')
      .update({ is_bankrupt: true, cash: 0 })
      .eq('id', playerId)

    throw new Error('Not enough cash to stock up — you are bankrupt!')
  }

  const { error } = await supabase
    .from('players')
    .update({
      cash: player.cash - totalCost,
      has_stocked_up: true,
    })
    .eq('id', playerId)

  if (error) throw new Error('Failed to stock up')

  return { newCash: player.cash - totalCost, cost: totalCost }
}

export async function submitBid(
  roomId: string,
  playerId: string,
  price: number,
  roundNumber: number
) {
  const supabase = createServerClient()

  // Validate player
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()

  if (!player) throw new Error('Player not found')
  if (player.is_bankrupt) throw new Error('Player is bankrupt')
  if (!player.has_stocked_up) throw new Error('Must stock up before bidding')

  // Validate minimum price
  const minPrice = player.has_patent
    ? GAME_CONFIG.MIN_PRICE_PATENT
    : GAME_CONFIG.MIN_PRICE_NORMAL
  if (price < minPrice) throw new Error(`Minimum price is ${minPrice}`)
  if (price > GAME_CONFIG.ROUND_3_PRICE_CEILING)
    throw new Error(`Maximum price is ${GAME_CONFIG.ROUND_3_PRICE_CEILING}`)

  // Upsert bid (update if already exists for this round)
  const { data: existingBid } = await supabase
    .from('bids')
    .select('id')
    .eq('room_id', roomId)
    .eq('player_id', playerId)
    .eq('round_number', roundNumber)
    .single()

  if (existingBid) {
    const { error } = await supabase
      .from('bids')
      .update({ price_submitted: price, submitted_at: new Date().toISOString() })
      .eq('id', existingBid.id)

    if (error) throw new Error('Failed to update bid')
  } else {
    const { error } = await supabase
      .from('bids')
      .insert({
        room_id: roomId,
        player_id: playerId,
        round_number: roundNumber,
        price_submitted: price,
      })

    if (error) throw new Error('Failed to submit bid')
  }

  return { success: true }
}

export async function startRound(roomId: string, roundNumber: number) {
  const supabase = createServerClient()

  // Get active (non-bankrupt) players
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_bankrupt', false)

  if (!players || players.length === 0) throw new Error('No active players')

  // Count patent holders for demand calc
  const patentHolders = players.filter((p) => p.has_patent).length

  // Calculate demand
  const demand = calculateDemand(roundNumber, players.length, patentHolders)

  // Determine new status
  const statusMap: Record<number, RoomStatus> = {
    1: 'ROUND_1_BIDDING',
    2: 'ROUND_2_BIDDING',
    3: 'ROUND_3_BIDDING',
  }

  const roundEndTime = new Date(
    Date.now() + GAME_CONFIG.ROUND_DURATION_SECONDS * 1000
  ).toISOString()

  // Reset has_stocked_up for all active players
  await supabase
    .from('players')
    .update({ has_stocked_up: false })
    .eq('room_id', roomId)
    .eq('is_bankrupt', false)

  // Update room
  const { error } = await supabase
    .from('rooms')
    .update({
      status: statusMap[roundNumber],
      current_demand: demand,
      round_end_time: roundEndTime,
    })
    .eq('id', roomId)

  if (error) throw new Error('Failed to start round')

  return { demand, playerCount: players.length }
}

export async function openPatentShop(roomId: string) {
  const supabase = createServerClient()

  // Count remaining (non-bankrupt) players
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', roomId)
    .eq('is_bankrupt', false)

  if (!players) throw new Error('No players')

  const patentsAvailable = Math.floor(players.length / 2)

  const { error } = await supabase
    .from('rooms')
    .update({
      status: 'PATENT_SHOP' as RoomStatus,
      patents_available: patentsAvailable,
      patents_sold: 0,
    })
    .eq('id', roomId)

  if (error) throw new Error('Failed to open patent shop')

  return { patentsAvailable }
}

export async function buyPatent(playerId: string) {
  const supabase = createServerClient()

  const { data, error } = await supabase.rpc('buy_patent', {
    p_player_id: playerId,
  })

  if (error) throw new Error(`Patent purchase failed: ${error.message}`)

  const result = data as unknown as {
    success: boolean
    error?: string
    remaining?: number
  }
  if (!result.success) throw new Error(result.error || 'Patent purchase failed')

  return result
}

export async function resolveRound(roomId: string, roundNumber: number) {
  const supabase = createServerClient()

  // Get room for demand
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (!room) throw new Error('Room not found')

  const currentDemand = room.current_demand

  // Get all bids for this round
  const { data: bids } = await supabase
    .from('bids')
    .select('*')
    .eq('room_id', roomId)
    .eq('round_number', roundNumber)
    .order('price_submitted', { ascending: true })

  if (!bids) throw new Error('No bids found')

  // Sort by price (ascending), then by submitted_at (earlier first)
  const sortedBids = [...bids].sort((a, b) => {
    if (a.price_submitted !== b.price_submitted)
      return a.price_submitted - b.price_submitted
    return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  })

  let remainingDemand = currentDemand
  const updates: { bidId: string; playerId: string; unitsSold: number; revenue: number }[] = []

  for (const bid of sortedBids) {
    // Round 3: price ceiling enforcement
    if (roundNumber === 3 && bid.price_submitted > GAME_CONFIG.ROUND_3_PRICE_CEILING) {
      updates.push({ bidId: bid.id, playerId: bid.player_id, unitsSold: 0, revenue: 0 })
      continue
    }

    const unitsToSell = Math.min(GAME_CONFIG.UNITS_PER_STOCK, remainingDemand)
    remainingDemand -= unitsToSell
    const revenue = unitsToSell * bid.price_submitted

    updates.push({
      bidId: bid.id,
      playerId: bid.player_id,
      unitsSold: unitsToSell,
      revenue,
    })
  }

  // Get all active players to check who didn't bid
  const { data: activePlayers } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', roomId)
    .eq('is_bankrupt', false)

  const biddingPlayerIds = new Set(bids.map((b) => b.player_id))

  // Apply updates
  for (const update of updates) {
    // Update bid with units sold
    await supabase
      .from('bids')
      .update({ units_sold: update.unitsSold })
      .eq('id', update.bidId)

    // Update player cash
    const { data: player } = await supabase
      .from('players')
      .select('cash')
      .eq('id', update.playerId)
      .single()

    if (player) {
      const newCash = player.cash + update.revenue
      await supabase
        .from('players')
        .update({
          cash: newCash,
          is_bankrupt: newCash <= 0,
        })
        .eq('id', update.playerId)
    }
  }

  // Bankrupt players who are active but didn't bid (0 revenue, already paid stock cost)
  if (activePlayers) {
    for (const ap of activePlayers) {
      if (!biddingPlayerIds.has(ap.id)) {
        const { data: player } = await supabase
          .from('players')
          .select('cash')
          .eq('id', ap.id)
          .single()

        if (player && player.cash <= 0) {
          await supabase
            .from('players')
            .update({ is_bankrupt: true })
            .eq('id', ap.id)
        }
      }
    }
  }

  // Update room status to results
  const resultStatusMap: Record<number, RoomStatus> = {
    1: 'ROUND_1_RESULTS',
    2: 'ROUND_2_RESULTS',
    3: 'ROUND_3_RESULTS',
  }

  await supabase
    .from('rooms')
    .update({
      status: resultStatusMap[roundNumber],
      round_end_time: null,
    })
    .eq('id', roomId)

  return updates
}

export async function endGame(roomId: string) {
  const supabase = createServerClient()

  await supabase
    .from('rooms')
    .update({ status: 'GAME_OVER' as RoomStatus })
    .eq('id', roomId)

  return { success: true }
}
