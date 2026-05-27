// Labels pt-BR + paletas pra status de pedido. Mantido aqui (pure) pra
// client components consumirem sem puxar DB.

import type { OrderStatus } from "models/order";

export const ORDER_STATUS_LABEL_PT_BR: Record<OrderStatus, string> = {
  criado: "Criado",
  separado: "Separado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

// Classes Tailwind pra colorir o badge. Mantemos no source pra Tailwind v4
// detectar (JIT lê o source).
export const ORDER_STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  criado: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  separado: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  entregue: "bg-green-500/10 text-green-700 dark:text-green-300",
  cancelado: "bg-red-500/10 text-red-700 dark:text-red-300",
};
