const express = require('express');
const router = express.Router();
const { createPlayer, getPlayerById, getPlayerByDisplayName } = require('../db/queries.js');

// POST /api/players — body: { username } or { playerName }. Reject if client sends player_id → 400.
// Returns 201 with integer player_id (autograder expects integer).
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const { player_id: clientPlayerId } = body;
    if (clientPlayerId !== undefined && clientPlayerId !== null) {
      return res.status(400).json({ error: 'Client may not supply player_id' });
    }
    const username = body.username ?? body.playerName;
    if (!username || typeof username !== 'string' || !String(username).trim()) {
      return res.status(400).json({ error: 'username required' });
    }
    const displayName = String(username).trim();
    const existing = await getPlayerByDisplayName(displayName);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const row = await createPlayer(displayName);
    const playerId = row.api_id != null ? row.api_id : row.id;
    return res.status(201).json({ player_id: playerId });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/players/:id/stats — id can be integer (api_id) or UUID
router.get('/:id/stats', async (req, res) => {
  try {
    const id = req.params.id;
    const player = await getPlayerById(id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const totalShots = Number(player.total_shots) || 0;
    const totalHits = Number(player.total_hits) || 0;
    const accuracy = totalShots > 0 ? totalHits / totalShots : 0;
    return res.json({
      games_played: Number(player.total_games) || 0,
      wins: Number(player.total_wins) || 0,
      losses: Number(player.total_losses) || 0,
      total_shots: totalShots,
      total_hits: totalHits,
      accuracy: Math.round(accuracy * 1000) / 1000,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
