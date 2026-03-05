# Battleship Server (Phase 1)

CPSC 3750 Distributed Multiplayer Battleship – Phase 1 API server. Passes Gradescope autograder (Checkpoint A/B/Final).

## Stack

- Node.js 18+, Express, PostgreSQL
- Env: `DATABASE_URL`, `PORT`, `TEST_MODE`, `TEST_PASSWORD` (default `clemson-test-2026`)

## Setup

1. Clone and install: `npm install`
2. Create `.env` from `.env.example` and set `DATABASE_URL` (PostgreSQL).
3. Run migrations: `npm run migrate`
4. Start: `npm start` (or `npm run dev` for watch mode)

## API (base path `/api`)

- **POST /api/reset** – Reset all games/state (players kept).
- **POST /api/players** – Body: `{ "username": "dan" }` → 201 `{ "player_id": "<uuid>" }`.
- **GET /api/players/:id/stats** – Lifetime stats (games_played, wins, losses, total_shots, total_hits, accuracy).
- **POST /api/games** – Body: `creator_id`, `grid_size` (5–15), `max_players` (≥1).
- **POST /api/games/:id/join** – Body: `{ "player_id" }`.
- **GET /api/games/:id** – Game state (game_id, grid_size, status, current_turn_index, active_players).
- **POST /api/games/:id/place** – Body: `player_id`, `ships`: 3 cells `{ row, col }`.
- **POST /api/games/:id/fire** – Body: `player_id`, `row`, `col`.
- **GET /api/games/:id/moves** – Chronological move log.

## Test mode (Gradescope)

Set `TEST_MODE=true` and `TEST_PASSWORD=clemson-test-2026`. Send header `X-Test-Password: clemson-test-2026`.

- **POST /api/test/games/:id/restart** – Reset game (ships/moves/status); stats unchanged.
- **POST /api/test/games/:id/ships** – Deterministic ship placement (same body as place).
- **GET /api/test/games/:id/board/:player_id** – Reveal board state.

## Testing concurrency (fire endpoint)

The fire endpoint is transaction-safe: the game row is locked with `SELECT ... FOR UPDATE` so only one fire is processed per turn. To verify locally:

1. Start the server and create a game with two players; place ships for both so the game is `active`.
2. In two terminals, run two `curl` fire requests at the same time (same game, same turn — only one player has the turn). For example:
   ```bash
   # Terminal 1 and 2 (run within a second of each other):
   curl -X POST http://localhost:3000/api/games/GAME_ID/fire -H "Content-Type: application/json" -d '{"player_id":"PLAYER_ID","row":0,"col":0}'
   ```
3. One request should return 200 with `result` and `next_player_id`; the other should return **403** `"Not your turn"` (or 400 if both targeted the same cell and one succeeded first). Exactly one move should be added; the other is rejected.

## Deploy (Render)

1. New Web Service; connect repo.
2. Add PostgreSQL (Render will set `DATABASE_URL`).
3. Env: `TEST_MODE=true`, `TEST_PASSWORD=clemson-test-2026`.
4. Build: (none). Start: `npm start`.
5. Put your service URL in `base_url.txt` and submit to Gradescope.
