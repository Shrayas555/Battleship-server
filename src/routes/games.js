const express = require('express');
const router = express.Router();
const {
  createGame,
  getGameById,
  getGamePlayers,
  joinGame,
  getGamePlayer,
  countGamePlayers,
  setGameStatus,
  setGameCurrentTurnIndex,
  placeShips,
  getShips,
  getMoves,
  allPlayersPlaced,
  executeFireInTransaction,
} = require('../db/queries.js');
const { getPlayerById } = require('../db/queries.js');

// POST /api/games — body: creator_id, grid_size, max_players
router.post('/', async (req, res) => {
  try {
    const { creator_id: creatorId, grid_size: gridSize, max_players: maxPlayers } = req.body || {};
    if (creatorId == null) return res.status(400).json({ error: 'creator_id required' });
    const creator = await getPlayerById(creatorId);
    if (!creator) return res.status(400).json({ error: 'Creator not found' });
    const g = Number(gridSize);
    const m = Number(maxPlayers);
    if (!Number.isInteger(g) || g < 5 || g > 15) return res.status(400).json({ error: 'grid_size must be 5-15' });
    if (!Number.isInteger(m) || m < 1) return res.status(400).json({ error: 'max_players must be >= 1' });
    const game = await createGame(creatorId, g, m);
    return res.status(201).json({
      game_id: game.id,
      grid_size: game.grid_size,
      max_players: game.max_players,
      status: game.status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games/:id/join — body: player_id
router.post('/:id/join', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_id: playerId } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'player_id required' });
    const game = await getGameById(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'waiting') return res.status(400).json({ error: 'Game not in waiting' });
    const player = await getPlayerById(playerId);
    if (!player) return res.status(400).json({ error: 'Player not found' });
    const existing = await getGamePlayer(gameId, playerId);
    if (existing) return res.status(400).json({ error: 'Already in game' });
    const count = await countGamePlayers(gameId);
    if (count >= game.max_players) return res.status(400).json({ error: 'Game full' });
    await joinGame(gameId, playerId, count);
    return res.status(200).json({ joined: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/games/:id
router.get('/:id', async (req, res) => {
  try {
    const game = await getGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const gamePlayers = await getGamePlayers(game.id);
    const activeCount = await countActivePlayers(game.id);
    return res.json({
      game_id: game.id,
      grid_size: game.grid_size,
      status: game.status,
      current_turn_index: game.current_turn_index,
      active_players: activeCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games/:id/place — body: player_id, ships: [ { row, col }, ... ]
router.post('/:id/place', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_id: playerId, ships: shipsBody } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'player_id required' });
    const game = await getGameById(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'waiting') return res.status(400).json({ error: 'Game not in placement phase' });
    const gp = await getGamePlayer(gameId, playerId);
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
    await placeShips(gameId, playerId, ships);
    if (await allPlayersPlaced(gameId)) {
      await setGameStatus(gameId, 'active');
    }
    return res.status(200).json({ placed: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/games/:id/fire — body: player_id, row, col (transaction-safe, row lock)
router.post('/:id/fire', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_id: playerId, row: rowBody, col: colBody } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'player_id required' });
    const row = Number(rowBody);
    const col = Number(colBody);
    const out = await executeFireInTransaction(gameId, playerId, row, col);
    if (!out.ok) {
      return res.status(out.status).json({ error: out.error });
    }
    return res.status(200).json(out.result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/games/:id/moves
router.get('/:id/moves', async (req, res) => {
  try {
    const game = await getGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const moves = await getMoves(game.id);
    return res.json(
      moves.map((m) => ({
        game_id: m.game_id,
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
