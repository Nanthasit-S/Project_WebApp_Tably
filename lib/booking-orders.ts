import type { PoolConnection } from "mariadb";

let bookingOrdersSchemaEnsured = false;

const buildInClause = (values: unknown[]) => values.map(() => "?").join(", ");

export const BOOKING_ORDER_STATUSES = {
  PENDING: "pending",
  PAID: "paid",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export type BookingOrderStatus =
  (typeof BOOKING_ORDER_STATUSES)[keyof typeof BOOKING_ORDER_STATUSES];

export async function ensureBookingOrdersSchema(conn: PoolConnection) {
  if (bookingOrdersSchemaEnsured) {
    return;
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS booking_orders (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id INT NOT NULL,
      booking_date DATE NOT NULL,
      total_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      expires_at DATETIME NULL,
      ref_nbr VARCHAR(64) NULL,
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  bookingOrdersSchemaEnsured = true;
}

export async function expireStaleBookingOrders(conn: PoolConnection) {
  const expiredOrders = (await conn.query(
    `
      SELECT id
      FROM booking_orders
      WHERE status = 'pending'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
      FOR UPDATE
    `,
  )) as Array<{ id: string }>;

  if (expiredOrders.length === 0) {
    return;
  }

  const orderIds = expiredOrders.map((order) => order.id);
  const placeholders = buildInClause(orderIds);

  await conn.query(
    `
      UPDATE booking_orders
      SET status = 'expired', updated_at = NOW()
      WHERE id IN (${placeholders})
    `,
    orderIds,
  );

  await conn.query(
    `
      UPDATE bookings
      SET status = 'cancelled'
      WHERE order_id IN (${placeholders}) AND status = 'pending_payment'
    `,
    orderIds,
  );
}
