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
      setError(err instanceof Error ? err.message : 'Không thể tham gia')
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
      setError(err instanceof Error ? err.message : 'Không thể nhập hàng')
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
      setError(err instanceof Error ? err.message : 'Không thể đặt giá')
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
      setError(err instanceof Error ? err.message : 'Không thể mua bằng sáng chế')
    } finally {
      setLoading(false)
    }
  }

  // Not joined yet
  if (!player) {
    // Game already started — block new joiners
    if (room.status !== 'LOBBY') {
      return (
        <main className="min-h-dvh flex items-center justify-center p-4">
          <div className="w-full max-w-sm space-y-4 text-center">
            <h1 className="text-3xl font-bold text-amber-400">
              CUỘC CHIẾN GIÁ CẢ
            </h1>
            <div
              className="p-6 rounded-2xl border space-y-3"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
            >
              <p className="text-2xl font-bold text-red-400">Đang Chơi</p>
              <p className="text-gray-400">
                Trò chơi đã bắt đầu. Bạn không thể tham gia giữa chừng.
              </p>
              <p className="text-gray-500 text-sm">
                Vui lòng chờ trò chơi tiếp theo hoặc nhờ người dẫn tạo phòng mới.
              </p>
            </div>
          </div>
        </main>
      )
    }

    return (
      <main className="min-h-dvh flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-3xl font-bold text-amber-400">
            CUỘC CHIẾN GIÁ CẢ
          </h1>
          <p className="text-gray-400">
            Tham gia phòng{' '}
            <span className="font-mono text-white">
              {initialRoom.room_code}
            </span>
          </p>
          {joining ? (
            <p className="text-amber-400">Đang vào...</p>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Tên của bạn"
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
          <h1 className="text-6xl font-bold text-red-400">PHÁ SẢN</h1>
          <p className="text-gray-400">
            Vốn của bạn đã bị thị trường nuốt chừng.
          </p>
          {player.bankrupt_reason && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <p className="text-red-300 text-sm font-medium">Lý do:</p>
              <p className="text-gray-300 text-sm mt-1">{player.bankrupt_reason}</p>
            </div>
          )}
          <p className="text-gray-500 text-lg font-semibold">
            Bạn giờ là thành viên của giai cấp Vô sản.
          </p>
          <p className="text-gray-600 text-sm">
            Vui lòng nhìn lên màn hình chiếu.
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
  const brandName = player.cookie_brand

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
              Bán: <span className="text-amber-300 font-semibold">{brandName}</span>
              {' · '}Chi phí: {productionCost}/lô{' '}
              {player.has_patent && '[Đã mua bằng SC]'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-amber-400">
              {player.cash} xu
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 text-sm text-center mb-4">
          {error}
        </div>
      )}

      {/* Waiting State + Tutorial */}
      {room.status === 'LOBBY' && (
        <div className="space-y-4">
          <div className="text-center py-4">
            <p className="text-gray-400 text-lg">
              Đang chờ Người dẫn bắt đầu trò chơi...
            </p>
          </div>

          {/* Tutorial */}
          <div
            className="p-5 rounded-2xl border space-y-4"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}
          >
            <h2 className="text-xl font-bold text-amber-400 text-center">
              📖 Hướng dẫn chơi
            </h2>

            <div className="space-y-1">
              <p className="text-white font-semibold">🎯 Mục tiêu</p>
              <p className="text-gray-400 text-sm">
                Kiếm được <span className="text-amber-400 font-bold">5.000 xu</span> trước khi hết 3 vòng chơi.
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-white font-semibold">🍪 Bạn là ai?</p>
              <p className="text-gray-400 text-sm">
                Bạn là chủ xưởng bánh <span className="text-amber-300 font-semibold">{player.cookie_brand}</span>. Mỗi vòng bạn sẽ <strong className="text-white">nhập hàng</strong> rồi <strong className="text-white">đặt giá bán</strong>.
              </p>
            </div>

            <hr className="border-gray-700" />

            <div className="space-y-3">
              <p className="text-white font-semibold">📋 Mỗi vòng diễn ra như sau:</p>

              <div className="pl-3 border-l-2 border-blue-500 space-y-1">
                <p className="text-blue-400 font-semibold text-sm">Bước 1 — Nhập hàng 📦</p>
                <p className="text-gray-400 text-sm">
                  Bấm nút <strong className="text-white">&quot;Nhập hàng&quot;</strong> để mua 100 lô bánh. Chi phí: <span className="text-red-400 font-bold">1.000 xu</span> (10 xu/lô). Tiền bị trừ ngay.
                </p>
              </div>

              <div className="pl-3 border-l-2 border-amber-500 space-y-1">
                <p className="text-amber-400 font-semibold text-sm">Bước 2 — Đặt giá bán 💰</p>
                <p className="text-gray-400 text-sm">
                  Chọn giá bán cho mỗi lô (từ <span className="text-white font-bold">11</span> đến <span className="text-white font-bold">50 xu</span>). Bạn có <span className="text-white font-bold">90 giây</span> để quyết định.
                </p>
              </div>

              <div className="pl-3 border-l-2 border-green-500 space-y-1">
                <p className="text-green-400 font-semibold text-sm">Bước 3 — Thị trường quyết định 📊</p>
                <p className="text-gray-400 text-sm">
                  Khách hàng sẽ <strong className="text-green-400">mua từ người bán giá rẻ nhất trước</strong>. Nếu nhiều người cùng giá, ai <strong className="text-white">đặt giá nhanh hơn</strong> sẽ được ưu tiên bán trước.
                </p>
              </div>
            </div>

            <hr className="border-gray-700" />

            <div className="space-y-2">
              <p className="text-white font-semibold text-sm">⚡ Lưu ý quan trọng</p>
              <div className="grid grid-cols-1 gap-1.5 text-sm">
                <p className="text-gray-400">📉 <strong className="text-white">Giá thấp</strong> = dễ bán nhưng lời ít</p>
                <p className="text-gray-400">📈 <strong className="text-white">Giá cao</strong> = lời nhiều nhưng có thể không ai mua</p>
                <p className="text-gray-400">💀 <strong className="text-red-400">Hết tiền</strong> = phá sản, bị loại khỏi game</p>
                <p className="text-gray-400">🏆 <strong className="text-amber-400">5.000 xu</strong> = chiến thắng!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {room.status === 'GAME_OVER' && (
        <div className="flex flex-col items-center justify-center flex-1 py-20">
          <p className="text-gray-400 text-lg text-center">
            Kết thúc! Xem màn hình chiếu để biết kết quả.
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
            <p className="text-gray-400 text-sm">Vòng {roundNumber}</p>
          </div>

          {/* Stock Up */}
          {!stockedUp ? (
            <button
              onClick={handleStockUp}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg transition disabled:opacity-50"
            >
              {loading
                ? 'Đang nhập hàng...'
                : `Nhập hàng (100 lô ${brandName}, -${
                    productionCost * GAME_CONFIG.UNITS_PER_STOCK
                  } xu)`}
            </button>
          ) : (
            <>
              <div className="p-3 rounded-xl bg-green-500/20 border border-green-500/50 text-green-400 text-center text-sm">
                Đã nhập hàng! 100 lô {brandName} sẵn sàng bán.
              </div>

              {/* Price Input */}
              <div className="space-y-3">
                <label className="block text-center text-gray-400">
                  Đặt giá mỗi lô {brandName}
                </label>
                <input
                  type="number"
                  min={minPrice}
                  max={GAME_CONFIG.ROUND_3_PRICE_CEILING}
                  value={price}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || /^\d+$/.test(val)) setPrice(val)
                  }}
                  placeholder={`${minPrice} – ${GAME_CONFIG.ROUND_3_PRICE_CEILING}`}
                  className={`w-full px-4 py-4 rounded-xl bg-black/50 border text-center text-3xl font-bold focus:outline-none transition tabular-nums ${
                    price && (parseInt(price) < minPrice || parseInt(price) > GAME_CONFIG.ROUND_3_PRICE_CEILING)
                      ? 'border-red-500 focus:border-red-400'
                      : 'border-gray-700 focus:border-amber-400'
                  }`}
                />
                {/* Validation warnings */}
                {price && parseInt(price) > GAME_CONFIG.ROUND_3_PRICE_CEILING && (
                  <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-sm text-center">
                    Khách hàng sẽ không mua với giá này! Tối đa: {GAME_CONFIG.ROUND_3_PRICE_CEILING} xu/lô
                  </div>
                )}
                {price && parseInt(price) > 0 && parseInt(price) < minPrice && (
                  <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-sm text-center">
                    Dưới giá thành! Bạn sẽ lỗ với mỗi lô bán ra.
                  </div>
                )}
                {!price && (
                  <p className="text-gray-500 text-sm text-center">
                    Khoảng hợp lệ: {minPrice} – {GAME_CONFIG.ROUND_3_PRICE_CEILING} xu/lô
                  </p>
                )}
                <button
                  onClick={handleSubmitBid}
                  disabled={
                    loading || !price || parseInt(price) < minPrice || parseInt(price) > GAME_CONFIG.ROUND_3_PRICE_CEILING || secondsLeft <= 0
                  }
                  className={`w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-50 ${
                    bidSubmitted
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-black'
                  }`}
                >
                  {secondsLeft <= 0
                    ? 'Hết giờ!'
                    : loading
                    ? 'Đang gửi...'
                    : bidSubmitted
                    ? `Đã cập nhật: ${price} xu/lô`
                    : 'Gửi giá'}
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
              CÔNG NGHỆ MỚI ĐƯỢC PHÁT MINH
            </h2>
            <p className="text-gray-400 mt-2">
              Giảm chi phí sản xuất xuống còn{' '}
              <span className="text-green-400 font-bold">5</span> mỗi lô
            </p>
            <p className="text-amber-400 font-bold text-xl mt-2">
              Giá: 600 Xu
            </p>
            <p className="text-gray-500 mt-2">
              Bằng sáng chế còn lại:{' '}
              <span className="text-white font-bold">
                {room.patents_available - room.patents_sold}
              </span>{' '}
              / {room.patents_available}
            </p>
          </div>

          {player.has_patent ? (
            <div className="p-4 rounded-xl bg-green-500/20 border border-green-500/50 text-green-400 text-center font-bold">
              Bạn đã sở hữu Bằng sáng chế!
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
                ? 'Đang mua...'
                : room.patents_sold >= room.patents_available
                ? 'Hết hàng'
                : player.cash < 600
                ? 'Không đủ xu'
                : 'Mua Bằng Sáng Chế (600 Xu)'}
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
                {lastRoundResult.unitsSold > 0 ? 'ĐÃ BÁN ĐƯỢC!' : 'KHÔNG BÁN ĐƯỢC'}
              </h2>
              <div className="space-y-1 text-left max-w-xs mx-auto">
                <div className="flex justify-between">
                  <span className="text-gray-400">Số lô đã bán:</span>
                  <span className="font-bold">
                    {lastRoundResult.unitsSold} /{' '}
                    {GAME_CONFIG.UNITS_PER_STOCK}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Doanh thu:</span>
                  <span className="font-bold text-green-400">
                    +{lastRoundResult.revenue}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Lợi nhuận ròng:</span>
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
                  <span className="text-gray-400">Số dư mới:</span>
                  <span className="font-bold text-amber-400 text-lg">
                    {player.cash} xu
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
              <p className="text-gray-400">Đang chờ kết quả...</p>
            </div>
          )}

          <p className="text-gray-500 text-center text-sm">
            Đang chờ Người dẫn chuyển tiếp...
          </p>
        </div>
      )}
    </main>
  )
}
