-- Schema cho web Niệm. Chạy 1 lần khi khởi tạo database.

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  referred_by INTEGER REFERENCES customers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  platform TEXT NOT NULL,
  service_label TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  link TEXT NOT NULL,
  total BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'moi', -- moi | xong | huy
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount BIGINT NOT NULL,
  content TEXT NOT NULL,       -- nội dung chuyển khoản đối chiếu (username)
  source TEXT NOT NULL DEFAULT 'sepay', -- sepay | admin
  bank_ref TEXT,                -- mã giao dịch ngân hàng, dùng chống trùng
  status TEXT NOT NULL DEFAULT 'da_duyet', -- deposit qua webhook luôn coi là đã có tiền thật
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdraws (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount BIGINT NOT NULL,
  fee BIGINT NOT NULL,
  net BIGINT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'cho_duyet', -- cho_duyet | da_duyet | tu_choi
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_log (
  id SERIAL PRIMARY KEY,
  to_customer_id INTEGER NOT NULL REFERENCES customers(id),
  from_customer_id INTEGER NOT NULL REFERENCES customers(id),
  level SMALLINT NOT NULL,     -- 1 = giới thiệu trực tiếp (10%), 2 = cấp trên (5%)
  amount BIGINT NOT NULL,
  deposit_id INTEGER REFERENCES deposits(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_deposits_customer ON deposits(customer_id);
CREATE INDEX IF NOT EXISTS idx_withdraws_customer ON withdraws(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_bankref ON deposits(bank_ref) WHERE bank_ref IS NOT NULL;
