/**
 * Turn order: game_players ordered by turn_order; current_turn_index is index into
 * the list of non-eliminated players. So we need ordered list of (non-eliminated) player ids
 * and current_turn_index points into that list.
 */

function getOrderedActivePlayerIds(gamePlayers) {
  const active = gamePlayers.filter((gp) => !gp.eliminated).sort((a, b) => a.turn_order - b.turn_order);
  return active.map((gp) => gp.player_id);
}

function getCurrentPlayerId(game, gamePlayers) {
  const activeIds = getOrderedActivePlayerIds(gamePlayers);
  if (activeIds.length === 0) return null;
  const idx = game.current_turn_index % activeIds.length;
  return activeIds[idx];
}

/**
 * After a fire: advance current_turn_index (within active players), or if only one left, game over.
 * Returns { nextPlayerId, gameStatus, winnerId }.
 */
function advanceTurn(game, gamePlayers) {
  const activeIds = getOrderedActivePlayerIds(gamePlayers);
  if (activeIds.length <= 1) {
    return {
      nextPlayerId: null,
      gameStatus: 'finished',
      winnerId: activeIds.length === 1 ? activeIds[0] : null,
    };
  }
  const currentIdx = game.current_turn_index % activeIds.length;
  const nextIdx = (currentIdx + 1) % activeIds.length;
  return {
    nextPlayerId: activeIds[nextIdx],
    nextTurnIndex: nextIdx,
    gameStatus: 'active',
    winnerId: null,
  };
}

module.exports = {
  getOrderedActivePlayerIds,
  getCurrentPlayerId,
  advanceTurn,
};
