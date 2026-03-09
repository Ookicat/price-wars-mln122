'use client'

import { useState, useEffect, useRef } from 'react'
import { joinRoom, getPlayer } from '@/lib/actions/player-actions'
import { stockUp, submitBid, buyPatent } from '@/lib/actions/game-actions'
import { useRealtimeRoom } from '@/lib/hooks/use-realtime-room'
import { useCountdown } from '@/lib/hooks/use-countdown'
import { createBrowserClient } from '@/lib/supabase/client'
import type { Room, Player } from '@/lib/types/database'
import { GAME_CONFIG, getRoundNumber } from '@/lib/types/game'

interface Props {
  initialRoom: Room
  initialName: string
}

export default function PlayerClient({ initialRoom, initialName }: Props) {
  const room = useRealtimeRoom(initialRoom.id, initialRoom)
  const secondsLeft = useCountdown(room.round_end_time)

  const [player, setPlayer] = useState<Player | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [price, setPrice] = useState('')
  const [bidSubmitted, setBidSubmitted] = useState(false)
  const [stockedUp, setStockedUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastRoundResult, setLastRoundResult] = useState<{
    unitsSold: number
    revenue: number
    profit: number
    newBalance: number
  } | null>(null)

  const roundNumber = getRoundNumber(room.status)
  const isBidding = room.status.includes('BIDDING')
  const isResults = room.status.includes('RESULTS')
  const joinAttempted = useRef(false)

  // Auto-join on mount (ref guard prevents Strict Mode double-fire)
  useEffect(() => {
    const storedPlayerId = localStorage.getItem(`player_${initialRoom.id}`)
    if (storedPlayerId) {
      setPlayerId(storedPlayerId)
      getPlayer(storedPlayerId).then((p) => {
        if (p) setPlayer(p)
        else {
          // Stored ID is stale, clear it
          localStorage.removeItem(`player_${initialRoom.id}`)
        }
      })
    } else if (initialName && !joinAttempted.current) {
      joinAttempted.current = true
      handleJoin(initialName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for player updates via realtime
  useEffect(() => {
    if (!playerId) return
    const supabase = createBrowserClient()
    const channelName = `player-${playerId}-${Date.now()}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `id=eq.${playerId}`,
        },
        (payload) => {
          setPlayer(payload.new as Player)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [playerId])

  // Reset bid state on new bidding round
  useEffect(() => {
    if (isBidding) {
      setBidSubmitted(false)
      setStockedUp(false)
      setPrice('')
      setLastRoundResult(null)
      // Refresh player data
      if (playerId) {
        getPlayer(playerId).then((p) => {
          if (p) {
            setPlayer(p)
            setStockedUp(p.has_stocked_up)
          }
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.status])

  // Fetch round results for this player
  useEffect(() => {
    if (isResults && playerId) {
      const supabase = createBrowserClient()
      const fetchResult = async () => {
        const { data: bid } = await supabase
          .from('bids')
          .select('*')
          .eq('player_id', playerId)
          .eq('round_number', roundNumber)
          .single()

        if (bid) {
          const costPerUnit = player?.has_patent
            ? GAME_CONFIG.PRODUCTION_COST_PATENT
            : GAME_CONFIG.PRODUCTION_COST_NORMAL
          const revenue = bid.units_sold * bid.price_submitted
          const productionCost = GAME_CONFIG.UNITS_PER_STOCK * costPerUnit
          setLastRoundResult({
            unitsSold: bid.units_sold,
            revenue,
            profit: revenue - productionCost,
            newBalance: player?.cash ?? 0,
          })
        }
      }
      fetchResult()
      // Also refresh player
      getPlayer(playerId).then((p) => {
        if (p) setPlayer(p)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResults])

  const handleJoin = async (name: string) => {
    setJoining(true)
    setError('')
    try {
      const p = await joinRoom(initialRoom.id, name)
      setPlayer(p)
      setPlayerId(p.id)
      localStorage.setItem(`player_${initialRoom.id}`, p.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const handleStockUp = async () => {
    if (!playerId) return
    setLoading(true)
    setError('')
    try {
      await stockUp(playerId, initialRoom.id)
      setStockedUp(true)
      // Refresh player
      const p = await getPlayer(playerId)
      if (p) setPlayer(p)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to stock up')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitBid = async () => {
    if (!playerId || !price) return
    setLoading(true)
    setError('')
    try {
      await submitBid(initialRoom.id, playerId, parseInt(price), roundNumber)
      setBidSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit bid')
    } finally {
      setLoading(false)
    }
  }

  const handleBuyPatent = async () => {
    if (!playerId) return
    setLoading(true)
    setError('')
    try {
      await buyPatent(playerId)
      // Refresh player
      const p = await getPlayer(playerId)
      if (p) setPlayer(p)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to buy patent')
    } finally {
      setLoading(false)
    }
  }

  // Not joined yet
  if (!player) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-3xl font-bold text-amber-400">
            THE PRICE WAR
          </h1>
          <p className="text-gray-400">
            Joining room{' '}
            <span className="font-mono text-white">
              {initialRoom.room_code}
            </span>
          </p>
          {joining ? (
            <p className="text-amber-400">Joining...</p>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Your Name"
                defaultValue={initialName}
                maxLength={20}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleJoin((e.target as HTMLInputElement).value)
                  }
                }}
                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-center text-lg focus:outline-none focus:border-amber-400 transition"
                id="name-input"
              />
              <button
                onClick={() => {
                  const input = document.getElementById(
                    'name-input'
                  ) as HTMLInputElement
                  handleJoin(input.value)
                }}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg transition"
              >
                JOIN
              </button>
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      </main>
    )
  }

  // Bankrupt screen
  if (player.is_bankrupt) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-4 animate-pulse-red">
        <div className="text-center space-y-4 max-w-sm">
          <h1 className="text-6xl font-bold text-red-400">BANKRUPT</h1>
          <p className="text-gray-400">
            Your capital was destroyed by market competition.
          </p>
          <p className="text-gray-500 text-lg font-semibold">
            You are now part of the Proletariat.
          </p>
          <p className="text-gray-600 text-sm">
            Please look at the projector.
          </p>
        </div>
      </main>
    )
  }

  const productionCost = player.has_patent
    ? GAME_CONFIG.PRODUCTION_COST_PATENT
    : GAME_CONFIG.PRODUCTION_COST_NORMAL
  const minPrice = player.has_patent
    ? GAME_CONFIG.MIN_PRICE_PATENT
    : GAME_CONFIG.MIN_PRICE_NORMAL

  return (
    <main className="min-h-dvh p-4 max-w-sm mx-auto">
      {/* Player Header */}
      <div
        className="p-4 rounded-2xl border mb-4"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--card-border)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-lg">{player.name}</p>
            <p className="text-gray-400 text-sm">
              Cost: {productionCost}/unit{' '}
              {player.has_patent && '[Patent]'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-amber-400">
              {player.cash} coins
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 text-sm text-center mb-4">
          {error}
        </div>
      )}

      {/* Waiting State */}
      {(room.status === 'LOBBY' || room.status === 'GAME_OVER') && (
        <div className="flex flex-col items-center justify-center flex-1 py-20">
          <p className="text-gray-400 text-lg text-center">
            {room.status === 'LOBBY'
              ? 'Waiting for the Presenter to start the game...'
              : 'Game Over! Check the projector for results.'}
          </p>
        </div>
      )}

      {/* Bidding Phase */}
      {isBidding && (
        <div className="space-y-4">
          {/* Timer */}
          <div className="text-center">
            <p
              className={`text-5xl font-bold tabular-nums ${
                secondsLeft <= 5
                  ? 'text-red-500 animate-pulse'
                  : 'text-white'
              }`}
            >
              {secondsLeft}s
            </p>
            <p className="text-gray-400 text-sm">Round {roundNumber}</p>
          </div>

          {/* Stock Up */}
          {!stockedUp ? (
            <button
              onClick={handleStockUp}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg transition disabled:opacity-50"
            >
              {loading
                ? 'Stocking up...'
                : `Stock Up (100 units, -${
                    productionCost * GAME_CONFIG.UNITS_PER_STOCK
                  } coins)`}
            </button>
          ) : (
            <>
              <div className="p-3 rounded-xl bg-green-500/20 border border-green-500/50 text-green-400 text-center text-sm">
                Stocked up! 100 units ready to sell.
              </div>

              {/* Price Input */}
              <div className="space-y-3">
                <label className="block text-center text-gray-400">
                  Set Your Price Per Unit
                </label>
                <input
                  type="number"
                  min={minPrice}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`Min: ${minPrice}`}
                  className="w-full px-4 py-4 rounded-xl bg-black/50 border border-gray-700 text-center text-3xl font-bold focus:outline-none focus:border-amber-400 transition tabular-nums"
                />
                <p className="text-gray-500 text-sm text-center">
                  Tips: To make profits, bid {minPrice} or higher
                  {roundNumber === 3 &&
                    `. Max price: ${GAME_CONFIG.ROUND_3_PRICE_CEILING}`}
                </p>
                <button
                  onClick={handleSubmitBid}
                  disabled={
                    loading || !price || parseInt(price) < minPrice
                  }
                  className={`w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-50 ${
                    bidSubmitted
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-black'
                  }`}
                >
                  {loading
                    ? 'Submitting...'
                    : bidSubmitted
                    ? `Bid Updated: ${price} coins/unit`
                    : 'Submit Bid'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Patent Shop */}
      {room.status === 'PATENT_SHOP' && (
        <div className="space-y-4">
          <div
            className="p-6 rounded-2xl border text-center"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--card-border)',
            }}
          >
            <h2 className="text-2xl font-bold text-purple-400">
              NEW TECHNOLOGY INVENTED
            </h2>
            <p className="text-gray-400 mt-2">
              Lowers your production cost to{' '}
              <span className="text-green-400 font-bold">5</span> per unit
            </p>
            <p className="text-amber-400 font-bold text-xl mt-2">
              Cost: 600 Coins
            </p>
            <p className="text-gray-500 mt-2">
              Patents Remaining:{' '}
              <span className="text-white font-bold">
                {room.patents_available - room.patents_sold}
              </span>{' '}
              / {room.patents_available}
            </p>
          </div>

          {player.has_patent ? (
            <div className="p-4 rounded-xl bg-green-500/20 border border-green-500/50 text-green-400 text-center font-bold">
              You own a Tech Patent!
            </div>
          ) : (
            <button
              onClick={handleBuyPatent}
              disabled={
                loading ||
                player.cash < 600 ||
                room.patents_sold >= room.patents_available
              }
              className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xl transition disabled:opacity-50"
            >
              {loading
                ? 'Buying...'
                : room.patents_sold >= room.patents_available
                ? 'Sold Out'
                : player.cash < 600
                ? 'Not Enough Cash'
                : 'Buy Tech Patent (600 Coins)'}
            </button>
          )}
        </div>
      )}

      {/* Results Phase */}
      {isResults && (
        <div className="space-y-4">
          {lastRoundResult ? (
            <div
              className={`p-6 rounded-2xl border text-center space-y-3 ${
                lastRoundResult.unitsSold > 0
                  ? 'animate-pulse-green'
                  : 'animate-pulse-red'
              }`}
              style={{ borderColor: 'var(--card-border)' }}
            >
              <h2
                className={`text-2xl font-bold ${
                  lastRoundResult.unitsSold > 0
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}
              >
                {lastRoundResult.unitsSold > 0 ? 'SALES MADE!' : 'NO SALES'}
              </h2>
              <div className="space-y-1 text-left max-w-xs mx-auto">
                <div className="flex justify-between">
                  <span className="text-gray-400">Units Sold:</span>
                  <span className="font-bold">
                    {lastRoundResult.unitsSold} /{' '}
                    {GAME_CONFIG.UNITS_PER_STOCK}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Revenue:</span>
                  <span className="font-bold text-green-400">
                    +{lastRoundResult.revenue}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Net Profit:</span>
                  <span
                    className={`font-bold ${
                      lastRoundResult.profit >= 0
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}
                  >
                    {lastRoundResult.profit >= 0 ? '+' : ''}
                    {lastRoundResult.profit}
                  </span>
                </div>
                <hr className="border-gray-700" />
                <div className="flex justify-between">
                  <span className="text-gray-400">New Balance:</span>
                  <span className="font-bold text-amber-400 text-lg">
                    {player.cash} coins
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="p-6 rounded-2xl border text-center"
              style={{
                background: 'var(--card)',
                borderColor: 'var(--card-border)',
              }}
            >
              <p className="text-gray-400">Waiting for results...</p>
            </div>
          )}

          <p className="text-gray-500 text-center text-sm">
            Waiting for the Presenter to advance...
          </p>
        </div>
      )}
    </main>
  )
}
