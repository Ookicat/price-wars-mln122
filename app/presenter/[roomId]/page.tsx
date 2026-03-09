import { getRoomById } from '@/lib/actions/room-actions'
import { getPlayers } from '@/lib/actions/player-actions'
import { notFound } from 'next/navigation'
import PresenterDashboard from './presenter-dashboard'

interface Props {
  params: Promise<{ roomId: string }>
}

export default async function PresenterPage({ params }: Props) {
  const { roomId } = await params
  const room = await getRoomById(roomId)
  if (!room) notFound()

  const players = await getPlayers(roomId)

  return <PresenterDashboard initialRoom={room} initialPlayers={players} />
}
