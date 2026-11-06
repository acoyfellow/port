CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), total_cents INTEGER NOT NULL, placed_on TEXT NOT NULL);
INSERT INTO customers (id, name, country) VALUES (1, 'Ada', 'UK'), (2, 'Grace', 'US'), (3, 'Linus', 'FI'), (4, 'Margaret', 'US');
INSERT INTO orders (id, customer_id, total_cents, placed_on) VALUES
  (1, 1, 1250, '2026-10-01'), (2, 2, 4800, '2026-10-02'), (3, 2, 2200, '2026-10-05'),
  (4, 3, 900, '2026-10-06'), (5, 4, 7300, '2026-10-07'), (6, 4, 1100, '2026-10-09'),
  (7, 1, 3400, '2026-10-11');
