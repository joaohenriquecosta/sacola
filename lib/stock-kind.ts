// Pure (no DB imports) — client components que precisam só dos IDs/labels
// importam daqui sem arrastar models/stock → infra/database → pg pro
// bundle do browser (mesmo padrão dos outros lib/* dos status).

export const STOCK_MOVEMENT_KINDS = ["in", "out", "adjust"] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export function isValidStockMovementKind(value: unknown): value is StockMovementKind {
  return typeof value === "string" && (STOCK_MOVEMENT_KINDS as readonly string[]).includes(value);
}

export const STOCK_MOVEMENT_KIND_LABEL_PT_BR: Record<StockMovementKind, string> = {
  in: "Entrada",
  out: "Saída",
  adjust: "Ajuste",
};

// Aplica o sign do kind sobre uma quantity bruta para obter o delta de
// saldo daquele movimento. Para 'in' soma; 'out' subtrai; 'adjust' usa
// quantity como já assinada (operador escolheu +/- ao registrar).
export function signedDelta(kind: StockMovementKind, quantity: number): number {
  if (kind === "in") return quantity;
  if (kind === "out") return -quantity;
  return quantity;
}
