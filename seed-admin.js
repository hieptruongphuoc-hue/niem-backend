// Tạo tài khoản quản trị đầu tiên. Chạy: node src/seed-admin.js <username> <password>
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("./db");

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.log("Cách dùng: node src/seed-admin.js ten_dang_nhap mat_khau");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = $2`,
    [username, hash]
  );
  console.log("Đã tạo tài khoản quản trị:", username);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
