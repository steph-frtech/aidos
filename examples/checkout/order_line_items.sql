-- examples/checkout — EXAMPLE-LOCAL persistence oracle (NOT a kernel truth, NOT a
-- hand-authored projection of the kernel). It is the minimal schema the demo slice's
-- createOrder persists against in the back acceptance mirror (real Postgres via
-- Testcontainers): an order and its line items. It models EXACTLY what "place an
-- order from a cart" pins — an order id and its line items (product + quantity) — and
-- NOTHING the idea does not pin: no total, no tax, no discount, no payment (out of
-- scope, an OpenQuestion). The emitted kernel Order DDL (gen/db/order.sql) carries a
-- `total` the slice never asserts; this oracle deliberately omits pricing.
CREATE TABLE IF NOT EXISTS demo_order (
    id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS demo_order_line (
    order_id TEXT NOT NULL REFERENCES demo_order (id),
    line_no  INT  NOT NULL,
    product  TEXT NOT NULL,
    quantity INT  NOT NULL,
    PRIMARY KEY (order_id, line_no)
);
