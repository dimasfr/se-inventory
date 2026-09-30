-- Up Migration

CREATE TYPE user_role AS ENUM ('staff', 'manager');
CREATE TYPE session_status AS ENUM ('open', 'submitted', 'approved', 'cancelled');
CREATE TYPE submission_status AS ENUM ('pending', 'superseded', 'rejected', 'approved');

CREATE TABLE stores (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role user_role NOT NULL,
  store_id int REFERENCES stores(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- staff always belongs to a store; managers are not tied to any store
  CHECK (role <> 'staff' OR store_id IS NOT NULL)
);

CREATE TABLE products (
  id serial PRIMARY KEY,
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

-- live stock per store
CREATE TABLE store_stock (
  store_id int NOT NULL REFERENCES stores(id),
  product_id int NOT NULL REFERENCES products(id),
  qty int NOT NULL CHECK (qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);

CREATE TABLE stock_sessions (
  id serial PRIMARY KEY,
  store_id int NOT NULL REFERENCES stores(id),
  status session_status NOT NULL DEFAULT 'open',
  note text,
  created_by int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by int REFERENCES users(id),
  approved_at timestamptz
);

-- one active session per store
CREATE UNIQUE INDEX one_active_session_per_store
  ON stock_sessions (store_id) WHERE status IN ('open', 'submitted');

-- stock snapshot taken when the session is initiated
CREATE TABLE session_items (
  session_id int NOT NULL REFERENCES stock_sessions(id),
  product_id int NOT NULL REFERENCES products(id),
  system_qty int NOT NULL,
  PRIMARY KEY (session_id, product_id)
);

CREATE TABLE submissions (
  id serial PRIMARY KEY,
  session_id int NOT NULL REFERENCES stock_sessions(id),
  version int NOT NULL,
  status submission_status NOT NULL DEFAULT 'pending',
  submitted_by int NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by int REFERENCES users(id),
  reviewed_at timestamptz,
  reject_reason text,
  UNIQUE (session_id, version),
  CHECK (status <> 'rejected' OR reject_reason IS NOT NULL)
);

-- at most one pending submission per session
CREATE UNIQUE INDEX one_pending_submission_per_session
  ON submissions (session_id) WHERE status = 'pending';

-- only counted items have a row; a missing row means "not counted"
CREATE TABLE submission_items (
  submission_id int NOT NULL REFERENCES submissions(id),
  session_id int NOT NULL,
  product_id int NOT NULL,
  counted_qty int NOT NULL CHECK (counted_qty >= 0),
  PRIMARY KEY (submission_id, product_id),
  -- item must exist in the session snapshot
  FOREIGN KEY (session_id, product_id) REFERENCES session_items(session_id, product_id)
);

-- audit trail of every stock change made by an approval
CREATE TABLE stock_movements (
  id bigserial PRIMARY KEY,
  store_id int NOT NULL REFERENCES stores(id),
  product_id int NOT NULL REFERENCES products(id),
  session_id int REFERENCES stock_sessions(id),
  submission_id int REFERENCES submissions(id),
  qty_before int NOT NULL,
  qty_after int NOT NULL,
  delta int GENERATED ALWAYS AS (qty_after - qty_before) STORED,
  reason text NOT NULL DEFAULT 'opname',
  created_by int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- approving the same submission twice cannot duplicate movements
  UNIQUE (submission_id, product_id)
);

CREATE INDEX idx_sessions_store ON stock_sessions (store_id, status);
CREATE INDEX idx_submissions_session ON submissions (session_id);
CREATE INDEX idx_movements_store_product ON stock_movements (store_id, product_id);

-- Down Migration

DROP TABLE stock_movements;
DROP TABLE submission_items;
DROP TABLE submissions;
DROP TABLE session_items;
DROP TABLE stock_sessions;
DROP TABLE store_stock;
DROP TABLE products;
DROP TABLE users;
DROP TABLE stores;
DROP TYPE submission_status;
DROP TYPE session_status;
DROP TYPE user_role;
