export type RoomStatus =
  | 'LOBBY'
  | 'ROUND_1_BIDDING'
  | 'ROUND_1_RESULTS'
  | 'PATENT_SHOP'
  | 'ROUND_2_BIDDING'
  | 'ROUND_2_RESULTS'
  | 'ROUND_3_BIDDING'
  | 'ROUND_3_RESULTS'
  | 'GAME_OVER'

export interface Room {
  id: string
  room_code: string
  status: RoomStatus
  current_demand: number
  patents_available: number
  patents_sold: number
  round_end_time: string | null
  created_at: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  cash: number
  has_patent: boolean
  is_bankrupt: boolean
  has_stocked_up: boolean
  created_at: string
}

export interface Bid {
  id: string
  room_id: string
  player_id: string
  round_number: number
  price_submitted: number
  submitted_at: string
  units_sold: number
}

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: Room
        Insert: Partial<Room> & { room_code: string }
        Update: Partial<Room>
      }
      players: {
        Row: Player
        Insert: Partial<Player> & { room_id: string; name: string }
        Update: Partial<Player>
      }
      bids: {
        Row: Bid
        Insert: Partial<Bid> & {
          room_id: string
          player_id: string
          round_number: number
          price_submitted: number
        }
        Update: Partial<Bid>
      }
    }
    Functions: {
      buy_patent: {
        Args: { p_player_id: string }
        Returns: { success: boolean; error?: string; remaining?: number }
      }
    }
  }
}
