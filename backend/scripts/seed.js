// Demo data. Safe to run more than once: existing rows are left untouched.
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../src/db');

const PASSWORD = 'password123';

const stores = [
  { code: 'JKT', name: 'Jakarta Store' },
  { code: 'BDG', name: 'Bandung Store' },
];

const products = [
  { sku: 'SKU-001', name: 'Mineral Water 600ml' },
  { sku: 'SKU-002', name: 'Instant Noodle Chicken' },
  { sku: 'SKU-003', name: 'Instant Noodle Beef' },
  { sku: 'SKU-004', name: 'Sweet Bread' },
  { sku: 'SKU-005', name: 'Milk 1L' },
  { sku: 'SKU-006', name: 'Cooking Oil 1L' },
  { sku: 'SKU-007', name: 'Rice 5kg' },
  { sku: 'SKU-008', name: 'Sugar 1kg' },
  { sku: 'SKU-009', name: 'Coffee Sachet' },
  { sku: 'SKU-010', name: 'Tissue Pack' },
];

// stock per store, index-aligned with `products`
const stock = {
  JKT: [120, 80, 60, 40, 55, 30, 25, 45, 200, 70],
  BDG: [90, 65, 50, 35, 40, 20, 18, 30, 150, 60],
};

const users = [
  { email: 'manager@example.com', name: 'Mira Manager', role: 'manager', store: null },
  { email: 'staff.jkt@example.com', name: 'Sari Staff (JKT)', role: 'staff', store: 'JKT' },
  { email: 'staff.bdg@example.com', name: 'Budi Staff (BDG)', role: 'staff', store: 'BDG' },
];

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  await withTransaction(async (db) => {
    const storeIds = {};
    for (const s of stores) {
      await db.query(
        'INSERT INTO stores (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
        [s.code, s.name]
      );
      const { rows } = await db.query('SELECT id FROM stores WHERE code = $1', [s.code]);
      storeIds[s.code] = rows[0].id;
    }

    const productIds = [];
    for (const p of products) {
      await db.query(
        'INSERT INTO products (sku, name) VALUES ($1, $2) ON CONFLICT (sku) DO NOTHING',
        [p.sku, p.name]
      );
      const { rows } = await db.query('SELECT id FROM products WHERE sku = $1', [p.sku]);
      productIds.push(rows[0].id);
    }

    for (const [code, qtys] of Object.entries(stock)) {
      for (let i = 0; i < productIds.length; i++) {
        await db.query(
          `INSERT INTO store_stock (store_id, product_id, qty) VALUES ($1, $2, $3)
           ON CONFLICT (store_id, product_id) DO NOTHING`,
          [storeIds[code], productIds[i], qtys[i]]
        );
      }
    }

    for (const u of users) {
      await db.query(
        `INSERT INTO users (email, password_hash, name, role, store_id)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
        [u.email, hash, u.name, u.role, u.store ? storeIds[u.store] : null]
      );
    }
  });

  console.log('Seed complete.');
  console.log(`Demo accounts (password: ${PASSWORD}):`);
  users.forEach((u) => console.log(`  ${u.role.padEnd(8)} ${u.email}`));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
