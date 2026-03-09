'use server'

import { createServerClient } from '@/lib/supabase/server'
import type { Room } from '@/lib/types/database'

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function createRoom(): Promise<Room> {
  const supabase = createServerClient()
  const roomCode = generateRoomCode()

  const { data, error } = await supabase
    .from('rooms')
    .insert({ room_code: roomCode, status: 'LOBBY' })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to create room: ${error?.message}`)
  return data as Room
}

export async function getRoom(roomCode: string): Promise<Room | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_code', roomCode.toUpperCase())
    .single()

  if (error) return null
  return data as Room
}

export async function getRoomById(roomId: string): Promise<Room | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (error) return null
  return data as Room
}
