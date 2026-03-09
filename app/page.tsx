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
      setError('Failed to create room')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!roomCode.trim() || !playerName.trim()) {
      setError('Please enter both room code and name')
      return
    }
    setLoading(true)
    setError('')
    try {
      const room = await getRoom(roomCode.toUpperCase())
      if (!room) {
        setError('Room not found')
        return
      }
      router.push(
        `/play/${room.id}?name=${encodeURIComponent(playerName.trim())}`
      )
    } catch {
      setError('Failed to find room')
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
            THE PRICE WAR
          </h1>
          <p className="text-gray-400 text-lg">
            Educational Economic Simulator
          </p>
          <p className="text-gray-500 text-sm mt-1">
            Goal: Reach <span className="text-amber-400 font-bold">5,000 Coins</span> by Round 3
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
          <h2 className="text-xl font-semibold text-center">Join Game</h2>
          <input
            type="text"
            placeholder="Room Code (e.g. A4B2)"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={4}
            className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 text-center text-2xl tracking-widest uppercase focus:outline-none focus:border-amber-400 transition"
          />
          <input
            type="text"
            placeholder="Your Name"
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
            {loading ? 'Joining...' : 'JOIN GAME'}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-500 text-sm">OR</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* Create Room */}
        <button
          onClick={handleCreateRoom}
          disabled={loading}
          className="w-full py-3 rounded-xl border-2 border-amber-500/50 hover:border-amber-400 text-amber-400 font-bold text-lg transition disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Room (Presenter)'}
        </button>

        {error && (
          <p className="text-red-400 text-center text-sm">{error}</p>
        )}
      </div>
    </main>
  )
}
