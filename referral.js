const { query } = require("./db");
const { REF_LEVEL1_RATE, REF_LEVEL2_RATE } = require("./pricing");

// Trả hoa hồng 2 cấp khi 1 khoản nạp tiền của "customerId" được ghi nhận là tiền thật.
// Cấp 1 (người giới thiệu trực tiếp) nhận 10%, cấp 2 (giới thiệu ra cấp 1) nhận 5%.
async function payReferralCommission(client, customerId, amount, depositId) {
  const { rows } = await client.query(
    "SELECT referred_by FROM customers WHERE id = $1",
    [customerId]
  );
  const ref1 = rows[0] && rows[0].referred_by;
  if (!ref1) return;

  const c1 = Math.round(amount * REF_LEVEL1_RATE);
  await client.query("UPDATE customers SET balance = balance + $1 WHERE id = $2", [c1, ref1]);
  await client.query(
    `INSERT INTO referral_log (to_customer_id, from_customer_id, level, amount, deposit_id)
     VALUES ($1, $2, 1, $3, $4)`,
    [ref1, customerId, c1, depositId]
  );

  const { rows: rows2 } = await client.query(
    "SELECT referred_by FROM customers WHERE id = $1",
    [ref1]
  );
  const ref2 = rows2[0] && rows2[0].referred_by;
  if (!ref2) return;

  const c2 = Math.round(amount * REF_LEVEL2_RATE);
  await client.query("UPDATE customers SET balance = balance + $1 WHERE id = $2", [c2, ref2]);
  await client.query(
    `INSERT INTO referral_log (to_customer_id, from_customer_id, level, amount, deposit_id)
     VALUES ($1, $2, 2, $3, $4)`,
    [ref2, customerId, c2, depositId]
  );
}

module.exports = { payReferralCommission };
