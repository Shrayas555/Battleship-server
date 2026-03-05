-- Phase 1 Battleship schema (PostgreSQL)
-- Run once: psql $DATABASE_URL -f src/db/schema.sql (or use migrate.js)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_games INT NOT NULL DEFAULT 0,
  total_wins INT NOT NULL DEFAULT 0,
  total_losses INT NOT NULL DEFAULT 0,
  total_shots INT NOT NULL DEFAULT 0,
  total_hits INT NOT NULL DEFAULT 0,
  total_moves INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grid_size INT NOT NULL CHECK (grid_size >= 5 AND grid_size <= 15),
  max_players INT NOT NULL CHECK (max_players >= 1),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  current_turn_index INT NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES players(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  turn_order INT NOT NULL,
  ships_placed BOOLEAN NOT NULL DEFAULT false,
  eliminated BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, player_id)
);

CREATE TABLE IF NOT EXISTS ships (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  row INT NOT NULL,
  col INT NOT NULL,
  hit BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, player_id, row, col),
  FOREIGN KEY (game_id, player_id) REFERENCES game_players(game_id, player_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_row INT NOT NULL,
  target_col INT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('hit', 'miss')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id);
CREATE INDEX IF NOT EXISTS idx_moves_created ON moves(game_id, created_at);
