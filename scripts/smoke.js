/**
 * Local smoke test: reset, 2 players, game, join, place, fire, moves.
 * Run: BASE_URL=http://localhost:3000 node scripts/smoke.js (or npm run smoke)
 * Requires Node 18+ (fetch).
 */
const base = process.env.BASE_URL || 'http://localhost:3000';

function fail(msg, res) {
  console.log('FAIL:', msg, res ? `status=${res.status}` : '');
  process.exit(1);
}

async function run() {
  let res, body, gameId, p1Id, p2Id;

  res = await fetch(`${base}/api/reset`, { method: 'POST' });
  if (res.status !== 200) fail('POST /api/reset', res);
  body = await res.json();
  if (body.status !== 'reset') fail('POST /api/reset body.status', res);

  res = await fetch(`${base}/api/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke_p1' }),
  });
  if (res.status !== 201) fail('POST /api/players p1', res);
  body = await res.json();
  if (!body.player_id) fail('POST /api/players p1 player_id', res);
  p1Id = body.player_id;

  res = await fetch(`${base}/api/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke_p2' }),
  });
  if (res.status !== 201) fail('POST /api/players p2', res);
  body = await res.json();
  if (!body.player_id) fail('POST /api/players p2 player_id', res);
  p2Id = body.player_id;

  res = await fetch(`${base}/api/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator_id: p1Id, grid_size: 8, max_players: 10 }),
  });
  if (res.status !== 201) fail('POST /api/games', res);
  body = await res.json();
  if (!body.game_id) fail('POST /api/games game_id', res);
  gameId = body.game_id;

  res = await fetch(`${base}/api/games/${gameId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: p2Id }),
  });
  if (res.status !== 200) fail('POST /api/games/:id/join', res);

  const ships = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }];
  res = await fetch(`${base}/api/games/${gameId}/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: p1Id, ships }),
  });
  if (res.status !== 200) fail('POST /api/games/:id/place p1', res);

  res = await fetch(`${base}/api/games/${gameId}/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: p2Id, ships: [{ row: 5, col: 5 }, { row: 5, col: 6 }, { row: 5, col: 7 }] }),
  });
  if (res.status !== 200) fail('POST /api/games/:id/place p2', res);

  res = await fetch(`${base}/api/games/${gameId}/fire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_id: p1Id, row: 5, col: 5 }),
  });
  if (res.status !== 200) fail('POST /api/games/:id/fire', res);
  body = await res.json();
  if (body.result === undefined) fail('POST /api/games/:id/fire result', res);

  res = await fetch(`${base}/api/games/${gameId}/moves`);
  if (res.status !== 200) fail('GET /api/games/:id/moves', res);
  body = await res.json();
  if (!Array.isArray(body)) fail('GET /api/games/:id/moves array', res);
  if (body.length < 1) fail('GET /api/games/:id/moves length', res);
  const move = body[0];
  if (move.result === undefined || move.created_at === undefined) fail('GET /api/games/:id/moves keys', res);

  console.log('PASS');
}

run().catch((err) => {
  console.log('FAIL:', err.message);
  process.exit(1);
});
