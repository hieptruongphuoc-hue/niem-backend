const { Pool } = require("pg");

// DATABASE_URL do nơi lưu trữ (Railway, Supabase...) cấp sẵn, dạng:
// postgres://user:pass@host:5432/dbname
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
