const express = require('express');
const router = express.Router();
const playersRouter = require('./players.js');
const gamesRouter = require('./games.js');
const testRouter = require('./test.js');
const { resetNonPlayerData } = require('../db/queries.js');
const { testModeAuth } = require('../middleware/testMode.js');

// POST /api/reset
router.post('/reset', async (req, res) => {
  try {
    await resetNonPlayerData();
    return res.json({ status: 'reset' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.use('/players', playersRouter);
router.use('/games', gamesRouter);

// Test-mode routes (protected)
router.use('/test', testModeAuth, testRouter);

module.exports = router;
