'use server'

import { createServerClient } from '@/lib/supabase/server'
import type { Player } from '@/lib/types/database'

export async function joinRoom(roomId: string, playerName: string): Promise<Player> {
  const supabase = createServerClient()

  // Check if room exists and is in LOBBY
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (roomError || !room) throw new Error('Room not found')
  if (room.status !== 'LOBBY') throw new Error('Game already in progress')

  // Check for duplicate name
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', roomId)
    .eq('name', playerName.trim())
    .single()

  if (existing) throw new Error('Name already taken')

  const { data, error } = await supabase
    .from('players')
    .insert({
      room_id: roomId,
      name: playerName.trim(),
      cash: 1000,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to join room: ${error.message}`)
  return data as Player
}

export async function getPlayer(playerId: string): Promise<Player | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()

  if (error) return null
  return data as Player
}

export async function getPlayers(roomId: string): Promise<Player[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .order('cash', { ascending: false })

  if (error) return []
  return (data ?? []) as Player[]
}
