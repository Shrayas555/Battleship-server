const express = require('express');
const router = express.Router();
const {
  getGameById,
  getGamePlayer,
  getShips,
  resetGameState,
  placeShips,
  getPlayerById,
} = require('../db/queries.js');

// POST /api/test/games/:id/restart — id can be integer or UUID
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

// POST /api/test/games/:id/ships — body: player_id (integer), ships. Used by autograder test_place_ships.
router.post('/games/:id/ships', async (req, res) => {
  try {
    const game = await getGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const { player_id: playerIdParam, ships: shipsBody } = req.body || {};
    if (!playerIdParam) return res.status(400).json({ error: 'player_id required' });
    const player = await getPlayerById(playerIdParam);
    if (!player) return res.status(400).json({ error: 'Player not found' });
    const gp = await getGamePlayer(game.id, player.id);
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
    const { pool } = require('../db/connection.js');
    await pool.query('DELETE FROM ships WHERE game_id = $1 AND player_id = $2', [game.id, player.id]);
    await placeShips(game.id, player.id, ships);
    return res.status(200).json({ placed: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/test/games/:id/board/:player_id — id and player_id can be integer or UUID
router.get('/games/:id/board/:playerId', async (req, res) => {
  try {
    const game = await getGameById(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const player = await getPlayerById(req.params.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const gp = await getGamePlayer(game.id, player.id);
    if (!gp) return res.status(404).json({ error: 'Player not in game' });
    const ships = await getShips(game.id, player.id);
    const gameIdOut = game.api_id != null ? game.api_id : game.id;
    const playerIdOut = player.api_id != null ? player.api_id : player.id;
    return res.json({
      game_id: gameIdOut,
      player_id: playerIdOut,
      grid_size: game.grid_size,
      ships: ships.map((s) => ({ row: s.row, col: s.col, hit: s.hit })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
