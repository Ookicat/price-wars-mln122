import { getRoomById } from '@/lib/actions/room-actions'
import { notFound } from 'next/navigation'
import PlayerClient from './player-client'

interface Props {
  params: Promise<{ roomId: string }>
  searchParams: Promise<{ name?: string }>
}

export default async function PlayPage({ params, searchParams }: Props) {
  const { roomId } = await params
  const { name } = await searchParams

  const room = await getRoomById(roomId)
  if (!room) notFound()

  return <PlayerClient initialRoom={room} initialName={name || ''} />
}
