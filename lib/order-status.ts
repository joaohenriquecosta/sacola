// Pure (no DB imports) — client components que precisam só dos status IDs
// importam daqui sem arrastar models/order → infra/database → pg pro
// bundle do browser (mesmo padrão de @/lib/roles vs models/authorization).

export const ORDER_STATUSES = ["criado", "separado", "entregue", "cancelado"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isValidOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

// Matriz de transições válidas + feature exigida pra cada uma. Single
// source of truth — API valida usando isto, UI consulta pra renderizar
// só os botões aplicáveis. entregue/cancelado são terminais (nada sai
// deles); criado só entra na criação (POST), nunca como destino de PATCH.
export type OrderTransition = {
  to: OrderStatus;
  validFrom: readonly OrderStatus[];
  feature: string;
};

export const ORDER_TRANSITIONS: readonly OrderTransition[] = [
  {
    to: "separado",
    validFrom: ["criado"],
    feature: "transition:order:separar",
  },
  {
    to: "entregue",
    validFrom: ["separado"],
    feature: "transition:order:entregar",
  },
  {
    to: "cancelado",
    validFrom: ["criado", "separado"],
    feature: "transition:order:cancelar",
  },
];

export function findTransition(to: OrderStatus): OrderTransition | undefined {
  return ORDER_TRANSITIONS.find((t) => t.to === to);
}

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  const t = findTransition(to);
  return !!t && t.validFrom.includes(from);
}

// Quais transições estão disponíveis pro caller a partir de um estado.
// Usado pela UI: server calcula a interseção (matriz × features do
// membership) e renderiza só os botões aplicáveis.
export function availableTransitions(
  from: OrderStatus,
  callerFeatures: readonly string[],
): OrderTransition[] {
  return ORDER_TRANSITIONS.filter(
    (t) => t.validFrom.includes(from) && callerFeatures.includes(t.feature),
  );
}
