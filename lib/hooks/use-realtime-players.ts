'use client'

import { useEffect, useState, useRef } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import type { Player } from '@/lib/types/database'

export function useRealtimePlayers(roomId: string, initialPlayers: Player[]) {
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (subscribedRef.current) return
    subscribedRef.current = true

    const supabase = createBrowserClient()
    const channelName = `players-${roomId}-${Date.now()}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          // Refetch all players on any change
          const { data } = await supabase
            .from('players')
            .select('*')
            .eq('room_id', roomId)
            .order('cash', { ascending: false })

          if (data) setPlayers(data as Player[])
        }
      )
      .subscribe()

    return () => {
      subscribedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return players
}
