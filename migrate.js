// Chạy 1 lần: node src/migrate.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Đã tạo xong bảng dữ liệu.");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
