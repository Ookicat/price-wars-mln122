'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRoom, getRoom } from '@/lib/actions/room-actions'

export default function Home() {
  const router = useRouter()
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreateRoom = async () => {
    setLoading(true)
    setError('')
    try {
      const room = await createRoom()
      router.push(`/presenter/${room.id}`)
    } catch {
      setError('Không thể tạo phòng')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!roomCode.trim() || !playerName.trim()) {
      setError('Vui lòng nhập mã phòng và tên')
      return
    }
    setLoading(true)
    setError('')
    try {
      const room = await getRoom(roomCode.toUpperCase())
      if (!room) {
        setError('Không tìm thấy phòng')
        return
      }
      router.push(
        `/play/${room.id}?name=${encodeURIComponent(playerName.trim())}`
      )
    } catch {
      setError('Không thể tìm phòng')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-5xl font-bold text-amber-400 mb-2">
            CUỘC CHIẾN GIÁ CẢ
          </h1>
          <p className="text-gray-400 text-lg">
            Trò chơi mô phỏng kinh tế
          </p>
          <p className="text-gray-500 text-sm mt-1">
            Mục tiêu: Đạt <span className="text-amber-400 font-bold">5.000 Xu</span> sau Vòng 3
          </p>
        </div>

        {/* Join Game */}
        <div
          className="p-6 rounded-2xl border space-y-4"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--card-border)',
          }}
        >
          <h2 className="text-xl font-semibold text-center">Tham Gia Trò Chơi</h2>
          <input
            type="text"
            placeholder="Mã phòng (VD: A4B2)"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={4}
            className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-center text-2xl tracking-widest uppercase focus:outline-none focus:border-amber-400 transition"
          />
          <input
            type="text"
            placeholder="Tên của bạn"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
            className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-center text-lg focus:outline-none focus:border-amber-400 transition"
          />
          <button
            onClick={handleJoinRoom}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg transition disabled:opacity-50"
          >
            {loading ? 'Đang vào...' : 'VÀO CHƠI'}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-500 text-sm">HOẶC</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* Create Room */}
        <button
          onClick={handleCreateRoom}
          disabled={loading}
          className="w-full py-3 rounded-xl border-2 border-amber-500/50 hover:border-amber-400 text-amber-400 font-bold text-lg transition disabled:opacity-50"
        >
          {loading ? 'Đang tạo...' : 'Tạo Phòng (Người dẫn)'}
        </button>

        {error && (
          <p className="text-red-400 text-center text-sm">{error}</p>
        )}
      </div>
    </main>
  )
}
