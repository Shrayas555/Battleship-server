const express = require('express');
const router = express.Router();
const {
  createGame,
  getGameById,
  getGamePlayers,
  joinGame,
  getGamePlayer,
  countGamePlayers,
  countActivePlayers,
  setGameStatus,
  setGameCurrentTurnIndex,
  placeShips,
  getShips,
  getMoves,
  allPlayersPlaced,
  executeFireInTransaction,
} = require('../db/queries.js');
const { getPlayerById } = require('../db/queries.js');

// POST /api/games — body: creator_id (integer), grid_size, max_players. Returns 201 with integer game_id.
router.post('/', async (req, res) => {
  try {
    const { creator_id: creatorId, grid_size: gridSize, max_players: maxPlayers } = req.body || {};
    if (creatorId == null) return res.status(400).json({ error: 'creator_id required' });
    const g = Number(gridSize);
    const m = Number(maxPlayers);
    if (!Number.isInteger(g) || g < 5 || g > 15) return res.status(400).json({ error: 'grid_size must be 5-15' });
    if (!Number.isInteger(m) || m < 1) return res.status(400).json({ error: 'max_players must be >= 1' });
    const game = await createGame(creatorId, g, m);
    if (!game) return res.status(400).json({ error: 'Creator not found' });
    const gameId = game.api_id != null ? game.api_id : game.id;
    return res.status(201).json({
      game_id: gameId,
      grid_size: game.grid_size,
      max_players: game.max_players,
      status: game.status,
      game_status: game.status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games/:id/join — id can be integer or UUID; 404 if game not found (e.g. 99999).
router.post('/:id/join', async (req, res) => {
  try {
    const gameIdParam = req.params.id;
    const { player_id: playerIdParam } = req.body || {};
    if (!playerIdParam) return res.status(400).json({ error: 'player_id required' });
    const game = await getGameById(gameIdParam);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const player = await getPlayerById(playerIdParam);
    if (!player) return res.status(400).json({ error: 'Player not found' });
    if (game.status !== 'waiting') return res.status(400).json({ error: 'Game not in waiting' });
    const existing = await getGamePlayer(game.id, player.id);
    if (existing) return res.status(400).json({ error: 'Already in game' });
    const count = await countGamePlayers(game.id);
    if (count >= game.max_players) return res.status(400).json({ error: 'Game full' });
    await joinGame(game.id, player.id, count);
    return res.status(200).json({ joined: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/games/:id — id can be integer (api_id) or UUID. Must include game_id, grid_size, status (H4).
router.get('/:id', async (req, res) => {
  try {
    const game = await getGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const gamePlayers = await getGamePlayers(game.id);
    const activeCount = await countActivePlayers(game.id);
    const gameId = game.api_id != null ? game.api_id : game.id;
    const playerIds = [];
    for (const gp of gamePlayers) {
      const p = await getPlayerById(gp.player_id);
      playerIds.push(p && p.api_id != null ? p.api_id : gp.player_id);
    }
    return res.json({
      game_id: gameId,
      grid_size: game.grid_size,
      max_players: game.max_players,
      status: game.status,
      game_status: game.status,
      current_turn_index: game.current_turn_index,
      active_players: activeCount,
      player_ids: playerIds,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games/:id/place — body: player_id or playerId (integer), ships. Returns 201.
router.post('/:id/place', async (req, res) => {
  try {
    const gameIdParam = req.params.id;
    const body = req.body || {};
    const playerIdParam = body.player_id ?? body.playerId;
    const shipsBody = body.ships;
    if (!playerIdParam) return res.status(400).json({ error: 'player_id required' });
    const game = await getGameById(gameIdParam);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const player = await getPlayerById(playerIdParam);
    if (!player) return res.status(400).json({ error: 'Player not found' });
    if (game.status !== 'waiting') return res.status(400).json({ error: 'Game not in placement phase' });
    const gp = await getGamePlayer(game.id, player.id);
    if (!gp) return res.status(403).json({ error: 'Player not in game' });
    if (gp.ships_placed) return res.status(400).json({ error: 'Already placed ships' });
    if (!Array.isArray(shipsBody) || shipsBody.length !== 3) {
      return res.status(400).json({ error: 'Exactly 3 ships required' });
    }
    const gridSize = game.grid_size;
    const seen = new Set();
    const ships = [];
    for (const s of shipsBody) {
      const row = Number(s.row);
      const col = Number(s.col);
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= gridSize || col < 0 || col >= gridSize) {
        return res.status(400).json({ error: 'Invalid ship coordinates' });
      }
      const key = `${row},${col}`;
      if (seen.has(key)) return res.status(400).json({ error: 'Ships overlap' });
      seen.add(key);
      ships.push({ row, col });
    }
    await placeShips(game.id, player.id, ships);
    if (await allPlayersPlaced(game.id)) {
      await setGameStatus(game.id, 'active');
    }
    return res.status(201).json({ placed: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games/:id/fire — body: player_id (integer), row, col (transaction-safe, row lock)
router.post('/:id/fire', async (req, res) => {
  try {
    const gameIdParam = req.params.id;
    const { player_id: playerIdParam, row: rowBody, col: colBody } = req.body || {};
    if (!playerIdParam) return res.status(400).json({ error: 'player_id required' });
    const game = await getGameById(gameIdParam);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const player = await getPlayerById(playerIdParam);
    if (!player) return res.status(400).json({ error: 'Player not found' });
    const row = Number(rowBody);
    const col = Number(colBody);
    const out = await executeFireInTransaction(game.id, player.id, row, col);
    if (!out.ok) {
      return res.status(out.status).json({ error: out.error });
    }
    return res.status(200).json(out.result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/games/:id/moves — id can be integer or UUID
router.get('/:id/moves', async (req, res) => {
  try {
    const game = await getGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const moves = await getMoves(game.id);
    return res.json(
      moves.map((m) => ({
        game_id: game.api_id != null ? game.api_id : m.game_id,
        player_id: m.player_id,
        target_row: m.target_row,
        target_col: m.target_col,
        result: m.result,
        created_at: m.created_at,
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
