const { pool } = require('./connection.js');
const { getCurrentPlayerId, advanceTurn } = require('../lib/gameLogic.js');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(s) {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

// --- Players ---
async function createPlayer(displayName) {
  const r = await pool.query(
    'INSERT INTO players (display_name) VALUES ($1) RETURNING id',
    [displayName]
  );
  return r.rows[0].id;
}

async function getPlayerById(id) {
  const r = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function getPlayerByDisplayName(displayName) {
  const r = await pool.query('SELECT * FROM players WHERE display_name = $1', [displayName]);
  return r.rows[0] || null;
}

// --- Games ---
async function createGame(creatorId, gridSize, maxPlayers) {
  const client = await pool.connect();
  try {
    const gameR = await client.query(
      'INSERT INTO games (grid_size, max_players, status) VALUES ($1, $2, $3) RETURNING id, grid_size, max_players, status',
      [gridSize, maxPlayers, 'waiting']
    );
    const game = gameR.rows[0];
    await client.query(
      'INSERT INTO game_players (game_id, player_id, turn_order) VALUES ($1, $2, 0)',
      [game.id, creatorId]
    );
    return game;
  } finally {
    client.release();
  }
}

async function getGameById(id) {
  const r = await pool.query('SELECT * FROM games WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function getGamePlayers(gameId) {
  const r = await pool.query(
    'SELECT gp.*, p.display_name FROM game_players gp JOIN players p ON p.id = gp.player_id WHERE gp.game_id = $1 ORDER BY gp.turn_order',
    [gameId]
  );
  return r.rows;
}

async function joinGame(gameId, playerId, turnOrder) {
  await pool.query(
    'INSERT INTO game_players (game_id, player_id, turn_order) VALUES ($1, $2, $3)',
    [gameId, playerId, turnOrder]
  );
}

async function getGamePlayer(gameId, playerId) {
  const r = await pool.query(
    'SELECT * FROM game_players WHERE game_id = $1 AND player_id = $2',
    [gameId, playerId]
  );
  return r.rows[0] || null;
}

async function countGamePlayers(gameId) {
  const r = await pool.query('SELECT COUNT(*)::int AS c FROM game_players WHERE game_id = $1', [gameId]);
  return r.rows[0].c;
}

async function setGameStatus(gameId, status, winnerId = null) {
  await pool.query(
    'UPDATE games SET status = $1, winner_id = $2 WHERE id = $3',
    [status, winnerId, gameId]
  );
}

async function setGameCurrentTurnIndex(gameId, index) {
  await pool.query('UPDATE games SET current_turn_index = $1 WHERE id = $2', [index, gameId]);
}

// --- Ships ---
async function placeShips(gameId, playerId, ships) {
  const client = await pool.connect();
  try {
    for (const { row, col } of ships) {
      await client.query(
        'INSERT INTO ships (game_id, player_id, row, col) VALUES ($1, $2, $3, $4) ON CONFLICT (game_id, player_id, row, col) DO NOTHING',
        [gameId, playerId, row, col]
      );
    }
    await client.query(
      'UPDATE game_players SET ships_placed = true WHERE game_id = $1 AND player_id = $2',
      [gameId, playerId]
    );
  } finally {
    client.release();
  }
}

async function getShips(gameId, playerId) {
  const r = await pool.query(
    'SELECT row, col, hit FROM ships WHERE game_id = $1 AND player_id = $2',
    [gameId, playerId]
  );
  return r.rows;
}

async function deleteShipsForGame(gameId) {
  await pool.query('DELETE FROM ships WHERE game_id = $1', [gameId]);
}

// --- Moves ---
async function insertMove(gameId, playerId, targetRow, targetCol, result) {
  const r = await pool.query(
    'INSERT INTO moves (game_id, player_id, target_row, target_col, result) VALUES ($1, $2, $3, $4, $5) RETURNING id, game_id, player_id, target_row, target_col, result, created_at',
    [gameId, playerId, targetRow, targetCol, result]
  );
  return r.rows[0];
}

async function getMoves(gameId) {
  const r = await pool.query(
    'SELECT * FROM moves WHERE game_id = $1 ORDER BY created_at ASC',
    [gameId]
  );
  return r.rows;
}

async function hasFiredAt(gameId, row, col) {
  const r = await pool.query(
    'SELECT 1 FROM moves WHERE game_id = $1 AND target_row = $2 AND target_col = $3 LIMIT 1',
    [gameId, row, col]
  );
  return r.rows.length > 0;
}

async function deleteMovesForGame(gameId) {
  await pool.query('DELETE FROM moves WHERE game_id = $1', [gameId]);
}

// --- Hit ship ---
async function markShipHit(gameId, targetPlayerId, row, col) {
  const r = await pool.query(
    'UPDATE ships SET hit = true WHERE game_id = $1 AND player_id = $2 AND row = $3 AND col = $4 RETURNING 1',
    [gameId, targetPlayerId, row, col]
  );
  return r.rowCount > 0;
}

async function setPlayerEliminated(gameId, playerId) {
  await pool.query(
    'UPDATE game_players SET eliminated = true WHERE game_id = $1 AND player_id = $2',
    [gameId, playerId]
  );
}

async function countActivePlayers(gameId) {
  const r = await pool.query(
    'SELECT COUNT(*)::int AS c FROM game_players WHERE game_id = $1 AND eliminated = false',
    [gameId]
  );
  return r.rows[0].c;
}

// --- Stats (games/wins/losses only; shots/hits updated on each fire) ---
async function updatePlayerStatsOnGameEnd(playerId, isWinner) {
  await pool.query(
    `UPDATE players SET
      total_games = total_games + 1,
      total_wins = total_wins + $1,
      total_losses = total_losses + $2
    WHERE id = $3`,
    [isWinner ? 1 : 0, isWinner ? 0 : 1, playerId]
  );
}

async function incrementPlayerShotAndHit(playerId, hit) {
  await pool.query(
    'UPDATE players SET total_shots = total_shots + 1, total_hits = total_hits + $1, total_moves = total_moves + 1 WHERE id = $2',
    [hit ? 1 : 0, playerId]
  );
}

/**
 * Execute one fire move inside a single transaction with row lock.
 * Returns { ok: true, result: { result, next_player_id, game_status, winner_id? } } or
 * { ok: false, status: number, error: string }.
 */
async function executeFireInTransaction(gameId, playerId, row, col) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const gameRow = await client.query('SELECT * FROM games WHERE id = $1 FOR UPDATE', [gameId]);
    const game = gameRow.rows[0] || null;
    if (!game) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Game not found' };
    }
    if (game.status !== 'active') {
      await client.query('ROLLBACK');
      return { ok: false, status: 403, error: 'Game not active' };
    }

    const gpRow = await client.query(
      'SELECT * FROM game_players WHERE game_id = $1 ORDER BY turn_order',
      [gameId]
    );
    const gamePlayers = gpRow.rows;
    const gp = gamePlayers.find((p) => p.player_id === playerId);
    if (!gp) {
      await client.query('ROLLBACK');
      return { ok: false, status: 403, error: 'Player not in game' };
    }
    if (gp.eliminated) {
      await client.query('ROLLBACK');
      return { ok: false, status: 403, error: 'Player eliminated' };
    }

    const currentId = getCurrentPlayerId(game, gamePlayers);
    if (currentId !== playerId) {
      await client.query('ROLLBACK');
      return { ok: false, status: 403, error: 'Not your turn' };
    }

    const gridSize = game.grid_size;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= gridSize || col < 0 || col >= gridSize) {
      await client.query('ROLLBACK');
      return { ok: false, status: 400, error: 'Out of bounds' };
    }

    const dup = await client.query(
      'SELECT 1 FROM moves WHERE game_id = $1 AND target_row = $2 AND target_col = $3 LIMIT 1',
      [gameId, row, col]
    );
    if (dup.rows.length > 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 400, error: 'Already fired at this cell' };
    }

    let hit = false;
    const otherPlayers = gamePlayers.filter((p) => p.player_id !== playerId && !p.eliminated);
    for (const other of otherPlayers) {
      const up = await client.query(
        'UPDATE ships SET hit = true WHERE game_id = $1 AND player_id = $2 AND row = $3 AND col = $4 RETURNING 1',
        [gameId, other.player_id, row, col]
      );
      if (up.rowCount > 0) {
        hit = true;
        const ships = await client.query(
          'SELECT hit FROM ships WHERE game_id = $1 AND player_id = $2',
          [gameId, other.player_id]
        );
        const allHit = ships.rows.every((s) => s.hit);
        if (allHit) {
          await client.query(
            'UPDATE game_players SET eliminated = true WHERE game_id = $1 AND player_id = $2',
            [gameId, other.player_id]
          );
        }
        break;
      }
    }

    await client.query(
      'INSERT INTO moves (game_id, player_id, target_row, target_col, result) VALUES ($1, $2, $3, $4, $5)',
      [gameId, playerId, row, col, hit ? 'hit' : 'miss']
    );
    await client.query(
      'UPDATE players SET total_shots = total_shots + 1, total_hits = total_hits + $1, total_moves = total_moves + 1 WHERE id = $2',
      [hit ? 1 : 0, playerId]
    );

    const gpRowAfter = await client.query(
      'SELECT * FROM game_players WHERE game_id = $1 ORDER BY turn_order',
      [gameId]
    );
    const gamePlayersAfter = gpRowAfter.rows;
    const outcome = advanceTurn(game, gamePlayersAfter);

    if (outcome.gameStatus === 'finished') {
      await client.query(
        'UPDATE games SET status = $1, winner_id = $2 WHERE id = $3',
        ['finished', outcome.winnerId, gameId]
      );
      for (const g of gamePlayersAfter) {
        await client.query(
          'UPDATE players SET total_games = total_games + 1, total_wins = total_wins + $1, total_losses = total_losses + $2 WHERE id = $3',
          [g.player_id === outcome.winnerId ? 1 : 0, g.player_id === outcome.winnerId ? 0 : 1, g.player_id]
        );
      }
      await client.query('COMMIT');
      return {
        ok: true,
        result: {
          result: hit ? 'hit' : 'miss',
          next_player_id: null,
          game_status: 'finished',
          winner_id: outcome.winnerId,
        },
      };
    }

    await client.query(
      'UPDATE games SET current_turn_index = $1 WHERE id = $2',
      [outcome.nextTurnIndex, gameId]
    );
    await client.query('COMMIT');
    return {
      ok: true,
      result: {
        result: hit ? 'hit' : 'miss',
        next_player_id: outcome.nextPlayerId,
        game_status: 'active',
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// --- Reset (games, game_players, ships, moves; keep players) ---
async function resetNonPlayerData() {
  await pool.query('DELETE FROM moves');
  await pool.query('DELETE FROM ships');
  await pool.query('DELETE FROM game_players');
  await pool.query('DELETE FROM games');
}

// --- Test: restart game (ships, moves, status; keep game_players and stats) ---
async function resetGameState(gameId) {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM moves WHERE game_id = $1', [gameId]);
    await client.query('DELETE FROM ships WHERE game_id = $1', [gameId]);
    await client.query(
      'UPDATE game_players SET ships_placed = false, eliminated = false WHERE game_id = $1',
      [gameId]
    );
    await client.query(
      'UPDATE games SET status = $1, current_turn_index = 0, winner_id = NULL WHERE id = $2',
      ['waiting', gameId]
    );
  } finally {
    client.release();
  }
}

async function allPlayersPlaced(gameId) {
  const r = await pool.query(
    'SELECT COUNT(*)::int AS total, SUM(CASE WHEN ships_placed THEN 1 ELSE 0 END)::int AS placed FROM game_players WHERE game_id = $1',
    [gameId]
  );
  const row = r.rows[0];
  return row.total > 0 && row.total === row.placed;
}

module.exports = {
  createPlayer,
  getPlayerById,
  getPlayerByDisplayName,
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
  deleteShipsForGame,
  insertMove,
  getMoves,
  hasFiredAt,
  deleteMovesForGame,
  markShipHit,
  setPlayerEliminated,
  countActivePlayers,
  updatePlayerStatsOnGameEnd,
  incrementPlayerShotAndHit,
  resetNonPlayerData,
  resetGameState,
  allPlayersPlaced,
  executeFireInTransaction,
  isValidUUID,
};
