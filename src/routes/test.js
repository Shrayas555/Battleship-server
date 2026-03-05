const express = require('express');
const router = express.Router();
const {
  getGameById,
  getGamePlayer,
  getShips,
  resetGameState,
  placeShips,
} = require('../db/queries.js');

// POST /api/test/games/:id/restart — reset ships, moves, status=waiting; do not change player stats
router.post('/games/:id/restart', async (req, res) => {
  try {
    const game = await getGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    await resetGameState(game.id);
    return res.status(200).json({ status: 'restarted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/test/games/:id/ships — body: player_id, ships: [ { row, col }, ... ]
router.post('/games/:id/ships', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { player_id: playerId, ships: shipsBody } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'player_id required' });
    const game = await getGameById(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const gp = await getGamePlayer(gameId, playerId);
    if (!gp) return res.status(403).json({ error: 'Player not in game' });
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
    // Remove existing ships for this player in this game, then place
    const { pool } = require('../db/connection.js');
    await pool.query('DELETE FROM ships WHERE game_id = $1 AND player_id = $2', [gameId, playerId]);
    await placeShips(gameId, playerId, ships);
    return res.status(200).json({ placed: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/test/games/:id/board/:player_id — reveal board state (ships + hit/miss)
router.get('/games/:id/board/:playerId', async (req, res) => {
  try {
    const gameId = req.params.id;
    const playerId = req.params.playerId;
    const game = await getGameById(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const gp = await getGamePlayer(gameId, playerId);
    if (!gp) return res.status(404).json({ error: 'Player not in game' });
    const ships = await getShips(gameId, playerId);
    return res.json({
      game_id: gameId,
      player_id: playerId,
      grid_size: game.grid_size,
      ships: ships.map((s) => ({ row: s.row, col: s.col, hit: s.hit })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
