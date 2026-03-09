-- =============================================
-- The Price War - Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- Create enums
CREATE TYPE room_status AS ENUM (
  'LOBBY',
  'ROUND_1_BIDDING',
  'ROUND_1_RESULTS',
  'PATENT_SHOP',
  'ROUND_2_BIDDING',
  'ROUND_2_RESULTS',
  'ROUND_3_BIDDING',
  'ROUND_3_RESULTS',
  'GAME_OVER'
);

-- Table: rooms
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,
  status room_status NOT NULL DEFAULT 'LOBBY',
  current_demand INTEGER DEFAULT 0,
  patents_available INTEGER DEFAULT 0,
  patents_sold INTEGER DEFAULT 0,
  round_end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cash INTEGER NOT NULL DEFAULT 1000,
  has_patent BOOLEAN NOT NULL DEFAULT false,
  is_bankrupt BOOLEAN NOT NULL DEFAULT false,
  has_stocked_up BOOLEAN NOT NULL DEFAULT false,
  cookie_brand TEXT NOT NULL DEFAULT 'OREO',
  bankrupt_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: bids
CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  price_submitted INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  units_sold INTEGER DEFAULT 0
);

-- Indexes for fast lookups
CREATE INDEX idx_players_room_id ON players(room_id);
CREATE INDEX idx_bids_room_round ON bids(room_id, round_number);
CREATE INDEX idx_rooms_code ON rooms(room_code);

-- RPC: buy_patent (atomic patent purchase)
CREATE OR REPLACE FUNCTION buy_patent(p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_id UUID;
  v_cash INTEGER;
  v_has_patent BOOLEAN;
  v_patents_sold INTEGER;
  v_patents_available INTEGER;
  v_room_status room_status;
BEGIN
  -- Get player info
  SELECT room_id, cash, has_patent INTO v_room_id, v_cash, v_has_patent
  FROM players WHERE id = p_player_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found');
  END IF;

  IF v_has_patent THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already owns a patent');
  END IF;

  IF v_cash < 600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough cash');
  END IF;

  -- Lock room row and check status + availability
  SELECT status, patents_sold, patents_available INTO v_room_status, v_patents_sold, v_patents_available
  FROM rooms WHERE id = v_room_id FOR UPDATE;

  IF v_room_status != 'PATENT_SHOP' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Patent shop is not open');
  END IF;

  IF v_patents_sold >= v_patents_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'No patents remaining');
  END IF;

  -- Atomically purchase
  UPDATE players SET cash = cash - 600, has_patent = true WHERE id = p_player_id;
  UPDATE rooms SET patents_sold = patents_sold + 1 WHERE id = v_room_id;

  RETURN jsonb_build_object('success', true, 'remaining', v_patents_available - v_patents_sold - 1);
END;
$$;

-- Enable Row Level Security
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all for anonymous access (game uses room codes for auth)
CREATE POLICY "Allow all on rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow insert on bids" ON bids FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update on bids" ON bids FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow select on bids" ON bids FOR SELECT USING (true);

-- Enable realtime for rooms and players tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
