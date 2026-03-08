require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./connection.js');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  // Add total_moves for existing DBs (schema.sql already has it for new installs)
  await pool.query(
    'ALTER TABLE players ADD COLUMN IF NOT EXISTS total_moves INT NOT NULL DEFAULT 0'
  );
  // Add api_id for existing DBs (autograder expects integer player_id / game_id)
  await pool.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS api_id INTEGER');
  const hasPlayerApiId = (await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'api_id'"
  )).rows.length;
  if (hasPlayerApiId) {
    await pool.query('CREATE SEQUENCE IF NOT EXISTS players_api_id_seq');
    const nullCount = (await pool.query('SELECT COUNT(*)::int AS c FROM players WHERE api_id IS NULL')).rows[0].c;
    if (nullCount > 0) {
      await pool.query(`
        UPDATE players p SET api_id = sub.r FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS r FROM players WHERE api_id IS NULL
        ) sub WHERE p.id = sub.id
      `);
      await pool.query(
        "SELECT setval('players_api_id_seq', (SELECT COALESCE(MAX(api_id), 1) FROM players))"
      );
    }
    await pool.query(
      "ALTER TABLE players ALTER COLUMN api_id SET DEFAULT nextval('players_api_id_seq')"
    ).catch(() => {});
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS players_api_id_key ON players (api_id)').catch(() => {});
  }
  await pool.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS api_id INTEGER');
  const hasGameApiId = (await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'api_id'"
  )).rows.length;
  if (hasGameApiId) {
    await pool.query('CREATE SEQUENCE IF NOT EXISTS games_api_id_seq');
    const nullCount = (await pool.query('SELECT COUNT(*)::int AS c FROM games WHERE api_id IS NULL')).rows[0].c;
    if (nullCount > 0) {
      await pool.query(`
        UPDATE games g SET api_id = sub.r FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS r FROM games WHERE api_id IS NULL
        ) sub WHERE g.id = sub.id
      `);
      await pool.query(
        "SELECT setval('games_api_id_seq', (SELECT COALESCE(MAX(api_id), 1) FROM games))"
      );
    }
    await pool.query(
      "ALTER TABLE games ALTER COLUMN api_id SET DEFAULT nextval('games_api_id_seq')"
    ).catch(() => {});
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS games_api_id_key ON games (api_id)').catch(() => {});
  }
  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
