const express = require('express');
const router = express.Router();
const { createPlayer, getPlayerById, getPlayerByDisplayName, isValidUUID } = require('../db/queries.js');

// POST /api/players — body: { username }. Reject if client sends player_id → 400.
router.post('/', async (req, res) => {
  try {
    const { username, player_id: clientPlayerId } = req.body || {};
    if (clientPlayerId !== undefined && clientPlayerId !== null) {
      return res.status(400).json({ error: 'Client may not supply player_id' });
    }
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: 'username required' });
    }
    const displayName = username.trim();
    // Reuse existing player by display_name (globally unique)
    let player = await getPlayerByDisplayName(displayName);
    if (player) {
      return res.status(201).json({ player_id: player.id });
    }
    const id = await createPlayer(displayName);
    return res.status(201).json({ player_id: id });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/players/:id/stats
router.get('/:id/stats', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'Invalid player id' });
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
