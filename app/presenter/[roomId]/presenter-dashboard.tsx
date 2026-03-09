'use client'

import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useRealtimeRoom } from '@/lib/hooks/use-realtime-room'
import { useRealtimePlayers } from '@/lib/hooks/use-realtime-players'
import { useCountdown } from '@/lib/hooks/use-countdown'
import {
  startRound,
  resolveRound,
  openPatentShop,
  endGame,
} from '@/lib/actions/game-actions'
import { createBrowserClient } from '@/lib/supabase/client'
import type { Room, Player } from '@/lib/types/database'
import { GAME_CONFIG, getRoundNumber } from '@/lib/types/game'

interface Props {
  initialRoom: Room
  initialPlayers: Player[]
}

export default function PresenterDashboard({
  initialRoom,
  initialPlayers,
}: Props) {
  const room = useRealtimeRoom(initialRoom.id, initialRoom)
  const players = useRealtimePlayers(initialRoom.id, initialPlayers)
  const secondsLeft = useCountdown(room.round_end_time)
  const [loading, setLoading] = useState(false)
  const [bidsCount, setBidsCount] = useState(0)

  const activePlayers = players.filter((p) => !p.is_bankrupt)
  const bankruptPlayers = players.filter((p) => p.is_bankrupt)
  const roundNumber = getRoundNumber(room.status)
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}` : ''

  const isBidding = room.status.includes('BIDDING')

  // Poll bids count during bidding
  const pollBids = useCallback(async () => {
    if (!isBidding) return
    const supabase = createBrowserClient()
    const { count } = await supabase
      .from('bids')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('round_number', roundNumber)
    setBidsCount(count ?? 0)
  }, [isBidding, room.id, roundNumber])

  useEffect(() => {
    if (!isBidding) return
    pollBids()
    const interval = setInterval(pollBids, 1000)
    return () => clearInterval(interval)
  }, [isBidding, pollBids])

  const handleAction = async (action: () => Promise<unknown>) => {
    setLoading(true)
    try {
      await action()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getMaxCash = () => {
    if (players.length === 0) return GAME_CONFIG.WIN_CONDITION
    return Math.max(
      ...players.map((p) => p.cash),
      GAME_CONFIG.WIN_CONDITION
    )
  }

  return (
    <main className="min-h-dvh p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-amber-400">
            THE PRICE WAR
          </h1>
          <p className="text-gray-400">
            Room: <span className="text-2xl font-mono font-bold text-white">{room.room_code}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm">Status</p>
          <p className="text-lg font-semibold text-amber-400">
            {room.status.replace(/_/g, ' ')}
          </p>
          {isBidding && (
            <p className="text-4xl font-bold text-red-400 tabular-nums">
              {secondsLeft}s
            </p>
          )}
        </div>
      </div>

      {/* Lobby Phase */}
      {room.status === 'LOBBY' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* QR Code & Info */}
          <div
            className="flex flex-col items-center gap-6 p-8 rounded-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            <QRCodeSVG
              value={joinUrl}
              size={250}
              bgColor="#1a1a2e"
              fgColor="#f59e0b"
              level="M"
            />
            <div className="text-center">
              <p className="text-gray-400">Room Code</p>
              <p className="text-6xl font-mono font-bold text-amber-400 tracking-widest">
                {room.room_code}
              </p>
            </div>
            <div className="text-center text-gray-400">
              <p>
                Goal: Reach{' '}
                <span className="text-amber-400 font-bold">5,000 Coins</span>
              </p>
              <p className="text-sm mt-1">
                Players joined:{' '}
                <span className="text-white font-bold">{players.length}</span>
              </p>
            </div>
            <button
              onClick={() => handleAction(() => startRound(room.id, 1))}
              disabled={loading || players.length < 2}
              className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xl transition disabled:opacity-50"
            >
              {loading
                ? 'Starting...'
                : `Start Round 1 (${players.length} players)`}
            </button>
          </div>

          {/* Player Grid */}
          <div
            className="p-6 rounded-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            <h2 className="text-xl font-semibold mb-4">Players</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
              {players.map((p, i) => (
                <div
                  key={p.id}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-gray-700 text-center animate-slide-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-sm text-gray-400">{p.cash} coins</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bidding Phase */}
      {isBidding && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div
              className="p-6 rounded-2xl border text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
            >
              <p className="text-gray-400 text-sm">Round</p>
              <p className="text-4xl font-bold text-amber-400">{roundNumber}</p>
            </div>
            <div
              className="p-6 rounded-2xl border text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
            >
              <p className="text-gray-400 text-sm">Demand</p>
              <p className="text-4xl font-bold text-green-400">
                {room.current_demand}
              </p>
              <p className="text-xs text-gray-500">units needed</p>
            </div>
            <div
              className="p-6 rounded-2xl border text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
            >
              <p className="text-gray-400 text-sm">Bids Received</p>
              <p className="text-4xl font-bold text-blue-400">
                {bidsCount} / {activePlayers.length}
              </p>
            </div>
          </div>

          {/* Countdown */}
          <div className="text-center">
            <p
              className={`text-8xl font-bold tabular-nums ${
                secondsLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'
              }`}
            >
              {secondsLeft}
            </p>
            <p className="text-gray-400 mt-2">seconds remaining</p>
          </div>

          <button
            onClick={() =>
              handleAction(() => resolveRound(room.id, roundNumber))
            }
            disabled={loading}
            className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xl transition disabled:opacity-50"
          >
            {loading ? 'Resolving...' : `End Round ${roundNumber}`}
          </button>
        </div>
      )}

      {/* Patent Shop */}
      {room.status === 'PATENT_SHOP' && (
        <div className="space-y-6">
          <div
            className="p-8 rounded-2xl border text-center"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            <h2 className="text-3xl font-bold text-purple-400 mb-4">
              PATENT SHOP OPEN
            </h2>
            <p className="text-gray-400 text-lg">
              Patents:{' '}
              <span className="text-white font-bold">{room.patents_sold}</span> /{' '}
              <span className="text-amber-400 font-bold">
                {room.patents_available}
              </span>{' '}
              sold
            </p>
            <p className="text-gray-500 mt-2">
              Players are buying patents on their phones...
            </p>
          </div>
          <button
            onClick={() => handleAction(() => startRound(room.id, 2))}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xl transition disabled:opacity-50"
          >
            {loading ? 'Starting...' : 'Start Round 2'}
          </button>
        </div>
      )}

      {/* Results Phase */}
      {room.status.includes('RESULTS') && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center">
            Round {roundNumber} Results
          </h2>

          {/* Bar Chart */}
          <div
            className="p-6 rounded-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            <div className="space-y-2">
              {[...players]
                .sort((a, b) => b.cash - a.cash)
                .map((player, index) => {
                  const maxCash = getMaxCash()
                  const widthPct = Math.max((player.cash / maxCash) * 100, 0)
                  const isWinner =
                    player.cash >= GAME_CONFIG.WIN_CONDITION

                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 animate-slide-up"
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <span className="w-6 text-right text-gray-500 text-sm">
                        {index + 1}
                      </span>
                      <span className="w-28 truncate text-sm font-medium">
                        {player.name}
                        {player.has_patent && ' [P]'}
                      </span>
                      <div className="flex-1 h-8 bg-black/30 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center px-2"
                          style={{
                            width: `${widthPct}%`,
                            background: player.is_bankrupt
                              ? '#ef4444'
                              : isWinner
                              ? '#f59e0b'
                              : '#22c55e',
                            minWidth: player.cash > 0 ? '40px' : '0',
                          }}
                        >
                          <span className="text-xs font-bold text-black whitespace-nowrap">
                            {player.cash} coins
                          </span>
                        </div>
                      </div>
                      {player.is_bankrupt && (
                        <span className="text-red-400 text-xs font-bold">
                          BANKRUPT
                        </span>
                      )}
                      {isWinner && (
                        <span className="text-amber-400 text-xs font-bold">
                          WINNER
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Win condition line */}
          <div className="text-center text-gray-400 text-sm">
            Win Condition: 5,000 coins | Active: {activePlayers.length} |
            Bankrupt: {bankruptPlayers.length}
          </div>

          {/* Next Phase Button */}
          <div className="flex gap-4">
            {room.status === 'ROUND_1_RESULTS' && (
              <button
                onClick={() =>
                  handleAction(() => openPatentShop(room.id))
                }
                disabled={loading}
                className="flex-1 py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xl transition disabled:opacity-50"
              >
                {loading ? 'Opening...' : 'Open Patent Shop'}
              </button>
            )}
            {room.status === 'ROUND_2_RESULTS' && (
              <button
                onClick={() =>
                  handleAction(() => startRound(room.id, 3))
                }
                disabled={loading}
                className="flex-1 py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xl transition disabled:opacity-50"
              >
                {loading ? 'Starting...' : 'Start Round 3'}
              </button>
            )}
            {room.status === 'ROUND_3_RESULTS' && (
              <button
                onClick={() => handleAction(() => endGame(room.id))}
                disabled={loading}
                className="flex-1 py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xl transition disabled:opacity-50"
              >
                {loading ? 'Ending...' : 'End Game'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Game Over */}
      {room.status === 'GAME_OVER' && (
        <div className="text-center space-y-8">
          <h2 className="text-5xl font-bold text-amber-400">GAME OVER</h2>
          <div
            className="p-6 rounded-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            {players
              .filter((p) => p.cash >= GAME_CONFIG.WIN_CONDITION)
              .map((p) => (
                <div
                  key={p.id}
                  className="text-2xl font-bold text-amber-400 mb-2"
                >
                  {p.name} — {p.cash} Coins
                </div>
              ))}
            {players.filter((p) => p.cash >= GAME_CONFIG.WIN_CONDITION)
              .length === 0 && (
              <p className="text-xl text-gray-400">
                No one reached 5,000 Coins! The market claimed everyone.
              </p>
            )}
          </div>
          <div
            className="p-6 rounded-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            <h3 className="text-lg font-semibold mb-4">Final Standings</h3>
            <div className="space-y-2">
              {[...players]
                .sort((a, b) => b.cash - a.cash)
                .map((p, i) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center"
                  >
                    <span>
                      #{i + 1} {p.name} {p.has_patent && '[P]'}{' '}
                      {p.is_bankrupt && '[X]'}
                    </span>
                    <span
                      className={
                        p.is_bankrupt ? 'text-red-400' : 'text-green-400'
                      }
                    >
                      {p.cash} coins
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
