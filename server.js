require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { pool, query } = require("./db");
const { signToken, authRequired, adminRequired } = require("./auth");
const { calcOrderTotal, WITHDRAW_FEE_RATE, MIN_DEPOSIT } = require("./pricing");
const { payReferralCommission } = require("./referral");

const app = express();
app.use(cors());
app.use(express.json());

const money = (n) => Number(n) || 0;

// ================= ĐĂNG KÝ / ĐĂNG NHẬP KHÁCH =================

app.post("/api/register", async (req, res) => {
  const { username, phone, name, password, refCode } = req.body || {};
  if (!username || !phone || !name || !password) {
    return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin." });
  }
  if (!/^[A-Za-z0-9_.]{4,20}$/.test(username)) {
    return res.status(400).json({ error: "Tên đăng nhập gồm 4-20 ký tự: chữ không dấu, số, dấu . hoặc _" });
  }
  try {
    let referredBy = null;
    if (refCode) {
      const r = await query(
        "SELECT id FROM customers WHERE username = $1 OR phone = $1",
        [refCode]
      );
      if (r.rows.length === 0) {
        return res.status(400).json({ error: "Không tìm thấy mã giới thiệu này." });
      }
      referredBy = r.rows[0].id;
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO customers (username, phone, name, password_hash, referred_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, phone, name, balance`,
      [username, phone, name, hash, referredBy]
    );
    const user = result.rows[0];
    const token = signToken({ customerId: user.id });
    res.json({ token, user });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(400).json({ error: "Tên đăng nhập hoặc số điện thoại đã được đăng ký." });
    }
    console.error(e);
    res.status(500).json({ error: "Lỗi hệ thống, vui lòng thử lại." });
  }
});

app.post("/api/login", async (req, res) => {
  const { usernameOrPhone, password } = req.body || {};
  if (!usernameOrPhone || !password) {
    return res.status(400).json({ error: "Vui lòng nhập tài khoản và mật khẩu." });
  }
  const r = await query(
    "SELECT * FROM customers WHERE username = $1 OR phone = $1",
    [usernameOrPhone]
  );
  const user = r.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(400).json({ error: "Sai tài khoản hoặc mật khẩu." });
  }
  const token = signToken({ customerId: user.id });
  res.json({
    token,
    user: { id: user.id, username: user.username, phone: user.phone, name: user.name, balance: user.balance },
  });
});

app.get("/api/me", authRequired, async (req, res) => {
  const r = await query(
    "SELECT id, username, phone, name, balance FROM customers WHERE id = $1",
    [req.user.customerId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: "Không tìm thấy tài khoản." });
  res.json({ user: r.rows[0] });
});

app.put("/api/me", authRequired, async (req, res) => {
  const { name, password } = req.body || {};
  if (!name) return res.status(400).json({ error: "Họ tên không được để trống." });
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await query("UPDATE customers SET name = $1, password_hash = $2 WHERE id = $3", [name, hash, req.user.customerId]);
  } else {
    await query("UPDATE customers SET name = $1 WHERE id = $2", [name, req.user.customerId]);
  }
  res.json({ ok: true });
});

// ================= ĐẶT DỊCH VỤ =================

app.post("/api/orders", authRequired, async (req, res) => {
  const { platform, category, quantity, link } = req.body || {};
  const qty = Number(quantity);
  const total = calcOrderTotal(platform, category, qty);
  if (total === null) return res.status(400).json({ error: "Dịch vụ hoặc số lượng không hợp lệ." });
  if (!link) return res.status(400).json({ error: "Vui lòng nhập liên kết." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await client.query("SELECT balance FROM customers WHERE id = $1 FOR UPDATE", [req.user.customerId]);
    const balance = money(c.rows[0] && c.rows[0].balance);
    if (balance < total) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Số dư không đủ. Cần ${total.toLocaleString("en-US")}đ, bạn đang có ${balance.toLocaleString("en-US")}đ.`,
      });
    }
    await client.query("UPDATE customers SET balance = balance - $1 WHERE id = $2", [total, req.user.customerId]);
    const svcLabel = require("./pricing").getService(platform, category).label + " · SL " + qty;
    const order = await client.query(
      `INSERT INTO orders (customer_id, platform, service_label, quantity, link, total)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.customerId, platform, svcLabel, qty, link, total]
    );
    await client.query("COMMIT");
    res.json({ order: order.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Lỗi hệ thống, vui lòng thử lại." });
  } finally {
    client.release();
  }
});

app.get("/api/orders", authRequired, async (req, res) => {
  const r = await query(
    "SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC",
    [req.user.customerId]
  );
  res.json({ orders: r.rows });
});

// ================= NẠP TIỀN QUA WEBHOOK SEPAY =================
// Cấu hình URL này (https://ten-mien-cua-ban.com/api/webhook/sepay) trong SePay,
// kèm SEPAY_API_KEY đặt trong biến môi trường để chỉ SePay gọi được.

app.post("/api/webhook/sepay", async (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Apikey ${process.env.SEPAY_API_KEY}`) {
    return res.status(401).json({ error: "Sai khóa xác thực." });
  }
  // SePay gửi: { transferAmount, content, referenceCode, ... } - xem tài liệu SePay để đối chiếu tên field chính xác
  const body = req.body || {};
  const amount = money(body.transferAmount);
  const content = String(body.content || "").toLowerCase();
  const bankRef = String(body.referenceCode || body.id || "");

  if (!amount || amount <= 0) return res.json({ success: true }); // không phải giao dịch tiền vào, bỏ qua

  // tìm username xuất hiện trong nội dung chuyển khoản
  const customers = await query("SELECT id, username FROM customers");
  const matched = customers.rows.find((c) => content.includes(String(c.username).toLowerCase()));
  if (!matched) {
    console.warn("Không khớp được khách hàng cho giao dịch:", content, amount);
    return res.json({ success: true, matched: false });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dep = await client.query(
      `INSERT INTO deposits (customer_id, amount, content, source, bank_ref, status)
       VALUES ($1, $2, $3, 'sepay', $4, 'da_duyet')
       ON CONFLICT (bank_ref) DO NOTHING RETURNING id`,
      [matched.id, amount, content, bankRef || null]
    );
    if (dep.rows.length === 0) {
      // giao dịch đã xử lý trước đó (chống cộng tiền 2 lần)
      await client.query("ROLLBACK");
      return res.json({ success: true, duplicate: true });
    }
    await client.query("UPDATE customers SET balance = balance + $1 WHERE id = $2", [amount, matched.id]);
    await payReferralCommission(client, matched.id, amount, dep.rows[0].id);
    await client.query("COMMIT");
    res.json({ success: true, customerId: matched.id, amount });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Lỗi xử lý giao dịch." });
  } finally {
    client.release();
  }
});

// Khách xem thông tin nạp tiền cần biết (nội dung chuyển khoản, số tiền tối thiểu)
app.get("/api/deposit-info", authRequired, async (req, res) => {
  const r = await query("SELECT username FROM customers WHERE id = $1", [req.user.customerId]);
  res.json({ content: r.rows[0].username, minAmount: MIN_DEPOSIT });
});

app.get("/api/deposits", authRequired, async (req, res) => {
  const r = await query(
    "SELECT * FROM deposits WHERE customer_id = $1 ORDER BY created_at DESC",
    [req.user.customerId]
  );
  res.json({ deposits: r.rows });
});

// ================= RÚT TIỀN (PHÍ 20%) =================

app.post("/api/withdraws", authRequired, async (req, res) => {
  const { amount, bankName, accountNumber, accountHolder, contactPhone } = req.body || {};
  const amt = money(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "Vui lòng nhập số tiền hợp lệ." });
  if (!bankName) return res.status(400).json({ error: "Vui lòng nhập tên ngân hàng." });
  if (!/^\d{6,20}$/.test(accountNumber || "")) return res.status(400).json({ error: "Số tài khoản không hợp lệ." });
  if (!accountHolder) return res.status(400).json({ error: "Vui lòng nhập tên chủ tài khoản." });
  if (!/^\d{9,11}$/.test(contactPhone || "")) return res.status(400).json({ error: "Số điện thoại không hợp lệ." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await client.query("SELECT balance FROM customers WHERE id = $1 FOR UPDATE", [req.user.customerId]);
    const balance = money(c.rows[0] && c.rows[0].balance);
    if (balance < amt) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Số dư không đủ để rút. Số dư hiện có: ${balance.toLocaleString("en-US")}đ` });
    }
    const fee = Math.round(amt * WITHDRAW_FEE_RATE);
    const net = amt - fee;
    await client.query("UPDATE customers SET balance = balance - $1 WHERE id = $2", [amt, req.user.customerId]);
    const w = await client.query(
      `INSERT INTO withdraws (customer_id, amount, fee, net, bank_name, account_number, account_holder, contact_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.customerId, amt, fee, net, bankName, accountNumber, accountHolder.toUpperCase(), contactPhone]
    );
    await client.query("COMMIT");
    res.json({ withdraw: w.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Lỗi hệ thống, vui lòng thử lại." });
  } finally {
    client.release();
  }
});

// ================= GIỚI THIỆU =================

app.get("/api/referral", authRequired, async (req, res) => {
  const me = await query("SELECT username FROM customers WHERE id = $1", [req.user.customerId]);
  const count = await query("SELECT COUNT(*)::int AS c FROM customers WHERE referred_by = $1", [req.user.customerId]);
  const log = await query(
    `SELECT rl.level, rl.amount, rl.created_at, c.username AS from_username
     FROM referral_log rl JOIN customers c ON c.id = rl.from_customer_id
     WHERE rl.to_customer_id = $1 ORDER BY rl.created_at DESC`,
    [req.user.customerId]
  );
  const total = log.rows.reduce((s, r) => s + money(r.amount), 0);
  res.json({ code: me.rows[0].username, referredCount: count.rows[0].c, totalCommission: total, log: log.rows });
});

// ================= QUẢN TRỊ =================

app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body || {};
  const r = await query("SELECT * FROM admins WHERE username = $1", [username]);
  const admin = r.rows[0];
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(400).json({ error: "Sai tài khoản hoặc mật khẩu quản trị." });
  }
  const token = signToken({ adminId: admin.id, isAdmin: true });
  res.json({ token });
});

app.get("/api/admin/orders", adminRequired, async (req, res) => {
  const r = await query(
    `SELECT o.*, c.username, c.name FROM orders o JOIN customers c ON c.id = o.customer_id
     ORDER BY o.created_at DESC LIMIT 200`
  );
  res.json({ orders: r.rows });
});

app.post("/api/admin/orders/:id/status", adminRequired, async (req, res) => {
  const { status } = req.body || {}; // xong | huy | moi
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [req.params.id]);
    const order = cur.rows[0];
    if (!order) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Không tìm thấy đơn." }); }
    if (status === "huy" && order.status !== "xong" && order.status !== "huy") {
      await client.query("UPDATE customers SET balance = balance + $1 WHERE id = $2", [order.total, order.customer_id]);
    }
    await client.query("UPDATE orders SET status = $1 WHERE id = $2", [status, req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Lỗi hệ thống." });
  } finally {
    client.release();
  }
});

app.get("/api/admin/withdraws", adminRequired, async (req, res) => {
  const r = await query(
    `SELECT w.*, c.username, c.name FROM withdraws w JOIN customers c ON c.id = w.customer_id
     ORDER BY w.created_at DESC LIMIT 200`
  );
  res.json({ withdraws: r.rows });
});

app.post("/api/admin/withdraws/:id/status", adminRequired, async (req, res) => {
  const { status } = req.body || {}; // da_duyet | tu_choi
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT * FROM withdraws WHERE id = $1 FOR UPDATE", [req.params.id]);
    const w = cur.rows[0];
    if (!w) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Không tìm thấy yêu cầu." }); }
    if (status === "tu_choi" && w.status === "cho_duyet") {
      await client.query("UPDATE customers SET balance = balance + $1 WHERE id = $2", [w.amount, w.customer_id]);
    }
    await client.query("UPDATE withdraws SET status = $1 WHERE id = $2", [status, req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Lỗi hệ thống." });
  } finally {
    client.release();
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Niệm backend đang chạy ở cổng " + PORT));
