// Pure (no DB imports) — client components que precisam só dos status IDs
// importam daqui sem arrastar models/order → infra/database → pg pro
// bundle do browser (mesmo padrão de @/lib/roles vs models/authorization).

export const ORDER_STATUSES = ["criado", "separado", "entregue", "cancelado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isValidOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}
