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
import { GAME_CONFIG, getRoundNumber, calculateDemand } from '@/lib/types/game'

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
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/play/${initialRoom.id}` : ''

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
            CUỘC CHIẾN GIÁ CẢ
          </h1>
          <p className="text-gray-400">
            Phòng: <span className="text-2xl font-mono font-bold text-white">{room.room_code}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm">Trạng thái</p>
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
              <p className="text-gray-400">Mã phòng</p>
              <p className="text-6xl font-mono font-bold text-amber-400 tracking-widest">
                {room.room_code}
              </p>
            </div>
            <div className="text-center text-gray-400">
              <p>
                Mục tiêu: Đạt{' '}
                <span className="text-amber-400 font-bold">5.000 Xu</span>
              </p>
              <p className="text-sm mt-1">
                Người chơi đã vào:{' '}
                <span className="text-white font-bold">{players.length}</span>
              </p>
            </div>
            <button
              onClick={() => handleAction(() => startRound(room.id, 1))}
              disabled={loading || players.length < 2}
              className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xl transition disabled:opacity-50"
            >
              {loading
                ? 'Đang bắt đầu...'
                : `Bắt đầu Vòng 1 (${players.length} người chơi)`}
            </button>
          </div>

          {/* Player Grid */}
          <div
            className="p-6 rounded-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            <h2 className="text-xl font-semibold mb-4">Người chơi</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
              {players.map((p, i) => (
                <div
                  key={p.id}
                  className="px-3 py-2 rounded-lg bg-black/30 border border-gray-700 text-center animate-slide-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-sm text-gray-400">{p.cash} xu · {p.cookie_brand}</p>
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
              <p className="text-gray-400 text-sm">Vòng</p>
              <p className="text-4xl font-bold text-amber-400">{roundNumber}</p>
            </div>
            <div
              className="p-6 rounded-2xl border text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
            >
              <p className="text-gray-400 text-sm">Nhu cầu</p>
              <p className="text-4xl font-bold text-green-400">
                {room.current_demand}
              </p>
              <p className="text-xs text-gray-500">lô cần mua</p>
            </div>
            <div
              className="p-6 rounded-2xl border text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
            >
              <p className="text-gray-400 text-sm">Đã đặt giá</p>
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
            <p className="text-gray-400 mt-2">giây còn lại</p>
          </div>

          <button
            onClick={() =>
              handleAction(() => resolveRound(room.id, roundNumber))
            }
            disabled={loading}
            className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xl transition disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : `Kết thúc Vòng ${roundNumber}`}
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
              CỬA HÀNG BẲNG SÁNG CHẾ ĐÃ MỞ
            </h2>
            <p className="text-gray-400 text-lg">
              Bằng sáng chế:{' '}
              <span className="text-white font-bold">{room.patents_sold}</span> /{' '}
              <span className="text-amber-400 font-bold">
                {room.patents_available}
              </span>{' '}
              đã bán
            </p>
            <p className="text-gray-500 mt-2">
              Người chơi đang mua bằng sáng chế trên điện thoại...
            </p>
          </div>
          <div className="p-4 rounded-xl border space-y-1" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            <p className="text-green-400 font-semibold text-sm">📊 Vòng tiếp theo</p>
            <p className="text-gray-400 text-sm">
              Nhu cầu thị trường: <span className="text-white font-bold">{calculateDemand(2, activePlayers.length, activePlayers.filter(p => p.has_patent).length + room.patents_sold)} lô</span>
            </p>
          </div>
          <button
            onClick={() => handleAction(() => startRound(room.id, 2))}
            disabled={loading}
            className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xl transition disabled:opacity-50"
          >
            {loading ? 'Đang bắt đầu...' : 'Bắt đầu Vòng 2'}
          </button>
        </div>
      )}

      {/* Results Phase */}
      {room.status.includes('RESULTS') && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center">
            Kết quả Vòng {roundNumber}
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
                      <span className="w-32 truncate text-sm font-medium">
                        {player.name}
                        {player.has_patent && ' [P]'}
                        <span className="text-xs text-gray-500 ml-1">
                          {player.cookie_brand}
                        </span>
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
                            {player.cash} xu
                          </span>
                        </div>
                      </div>
                      {player.is_bankrupt && (
                        <span className="text-red-400 text-xs font-bold">
                          PHÁ SẢN
                        </span>
                      )}
                      {isWinner && (
                        <span className="text-amber-400 text-xs font-bold">
                          THẮNG
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Win condition line */}
          <div className="text-center text-gray-400 text-sm">
            Điều kiện thắng: 5.000 xu | Còn lại: {activePlayers.length} |
            Phá sản: {bankruptPlayers.length}
          </div>

          {/* Next Phase Button */}
          <div className="flex gap-4">
            {(() => {
              // Check if any active player can afford to stock up next round
              const canAnyoneAffordNextRound = activePlayers.some((p) => {
                const cost = p.has_patent
                  ? GAME_CONFIG.PRODUCTION_COST_PATENT * GAME_CONFIG.UNITS_PER_STOCK
                  : GAME_CONFIG.PRODUCTION_COST_NORMAL * GAME_CONFIG.UNITS_PER_STOCK
                return p.cash >= cost
              })

              // If no one can afford to stock up and it's not already round 3 results, show Game Over
              if (!canAnyoneAffordNextRound && room.status !== 'ROUND_3_RESULTS') {
                return (
                  <>
                    <div className="w-full p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm text-center">
                      Không có người chơi nào đủ tiền để nhập hàng cho vòng tiếp theo.
                    </div>
                    <button
                      onClick={() => handleAction(() => endGame(room.id))}
                      disabled={loading}
                      className="flex-1 py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xl transition disabled:opacity-50"
                    >
                      {loading ? 'Đang kết thúc...' : 'Kết thúc trò chơi'}
                    </button>
                  </>
                )
              }

              return (
                <>
                  {room.status === 'ROUND_1_RESULTS' && (
                    <>
                      <div className="w-full p-4 rounded-xl border space-y-1" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
                        <p className="text-purple-400 font-semibold text-sm">🔬 Vòng tiếp theo</p>
                        <p className="text-gray-400 text-sm">
                          Số bằng sáng chế sẽ bán: <span className="text-white font-bold">{Math.floor(activePlayers.length / 2)}</span> / {activePlayers.length} người chơi
                        </p>
                        <p className="text-gray-500 text-xs">Giảm chi phí sản xuất từ 10 → 5 xu/lô · Giá: 600 xu</p>
                      </div>
                      <button
                        onClick={() =>
                          handleAction(() => openPatentShop(room.id))
                        }
                        disabled={loading}
                        className="flex-1 py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xl transition disabled:opacity-50"
                      >
                        {loading ? 'Đang mở...' : 'Mở cửa hàng Bằng SC'}
                      </button>
                    </>
                  )}
                  {room.status === 'ROUND_2_RESULTS' && (
                    <>
                      {players.some((p) => !p.is_bankrupt && p.cash >= GAME_CONFIG.WIN_CONDITION) && (
                        <button
                          onClick={() => handleAction(() => endGame(room.id))}
                          disabled={loading}
                          className="flex-1 py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xl transition disabled:opacity-50"
                        >
                          {loading ? 'Đang kết thúc...' : 'Kết thúc (Có người thắng sớm!)'}
                        </button>
                      )}
                      <div className="w-full p-4 rounded-xl border space-y-1" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
                        <p className="text-green-400 font-semibold text-sm">📊 Vòng tiếp theo</p>
                        <p className="text-gray-400 text-sm">
                          Nhu cầu thị trường: <span className="text-white font-bold">{calculateDemand(3, activePlayers.length, 0)} lô</span>
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          handleAction(() => startRound(room.id, 3))
                        }
                        disabled={loading}
                        className="flex-1 py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xl transition disabled:opacity-50"
                      >
                        {loading ? 'Đang bắt đầu...' : 'Bắt đầu Vòng 3'}
                      </button>
                    </>
                  )}
                  {room.status === 'ROUND_3_RESULTS' && (
                    <button
                      onClick={() => handleAction(() => endGame(room.id))}
                      disabled={loading}
                      className="flex-1 py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xl transition disabled:opacity-50"
                    >
                      {loading ? 'Đang kết thúc...' : 'Kết thúc trò chơi'}
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Game Over */}
      {room.status === 'GAME_OVER' && (
        <div className="text-center space-y-8">
          <h2 className="text-5xl font-bold text-amber-400">KẾT THÚC</h2>
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
                  {p.name} — {p.cash} Xu
                </div>
              ))}
            {players.filter((p) => p.cash >= GAME_CONFIG.WIN_CONDITION)
              .length === 0 && (
              <p className="text-xl text-gray-400">
                Không ai đạt 5.000 Xu! Thị trường đã nuốt chừng tất cả.
              </p>
            )}
          </div>
          <div
            className="p-6 rounded-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            <h3 className="text-lg font-semibold mb-4">Xếp hạng cuối cùng</h3>
            <div className="space-y-2">
              {[...players]
                .sort((a, b) => b.cash - a.cash)
                .map((p, i) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center"
                  >
                    <span>
                      #{i + 1} {p.name}{' '}
                      <span className="text-xs text-gray-500">({p.cookie_brand})</span>
                      {p.has_patent && ' [P]'}{' '}
                      {p.is_bankrupt && '[X]'}
                    </span>
                    <span
                      className={
                        p.is_bankrupt ? 'text-red-400' : 'text-green-400'
                      }
                    >
                      {p.cash} xu
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
