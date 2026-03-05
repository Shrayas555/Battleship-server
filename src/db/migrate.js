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
  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
