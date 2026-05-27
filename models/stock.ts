// Stock ledger. Append-only — cada movimento é uma linha imutável; saldo
// é derivado da soma assinada. Estorno = DELETE da linha errada + nova
// linha com motivo.
//
// in/out exigem quantity > 0 (sign vem do kind). adjust permite signed
// (operador escolhe + ou - no momento do lançamento).

import { query } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";
import {
  STOCK_MOVEMENT_KINDS,
  isValidStockMovementKind,
  signedDelta,
  type StockMovementKind,
} from "@/lib/stock-kind";

// Re-export pra callers existentes do model. Client components devem
// importar direto de @/lib/stock-kind.
export { STOCK_MOVEMENT_KINDS, isValidStockMovementKind };
export type { StockMovementKind };

export type StockMovement = {
  id: string;
  company_id: string;
  product_id: string;
  kind: StockMovementKind;
  quantity: number;
  reason: string | null;
  order_id: string | null;
  created_by: string;
  created_at: Date;
};

// View enriquecida pro histórico: nome do produto + signed delta
// pré-calculado. Útil pra UI não duplicar lógica.
export type StockMovementView = StockMovement & {
  product_name: string;
  product_unit: string;
  delta: number;
};

export type ProductBalance = {
  product_id: string;
  product_name: string;
  product_unit: string;
  balance: number;
};

const QTY_MAX = 99_999_999.999;
const REASON_MAX = 120;

export type CreateMovementInput = {
  companyId: string;
  productId: string;
  kind: StockMovementKind;
  quantity: number;
  reason?: string | null;
  orderId?: string | null;
  createdBy: string;
};

export async function createMovement(input: CreateMovementInput): Promise<StockMovement> {
  if (!isValidStockMovementKind(input.kind)) {
    throw new ValidationError({
      message: "Tipo de movimento inválido.",
      action: `Use um de: ${STOCK_MOVEMENT_KINDS.join(", ")}.`,
    });
  }
  validateQuantity(input.kind, input.quantity);

  const reason = normalizeReason(input.reason);

  const result = await query<StockMovement>({
    text: `
      INSERT INTO stock_movements
        (company_id, product_id, kind, quantity, reason, order_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    ;`,
    values: [
      input.companyId,
      input.productId,
      input.kind,
      input.quantity,
      reason,
      input.orderId ?? null,
      input.createdBy,
    ],
  });
  return parseMovementRow(result.rows[0]);
}

export async function getMovementById(id: string): Promise<StockMovement> {
  const result = await query<StockMovement>({
    text: `SELECT * FROM stock_movements WHERE id = $1 LIMIT 1;`,
    values: [id],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`StockMovement ${id} not found`),
      message: "Movimento não encontrado.",
    });
  }
  return parseMovementRow(result.rows[0]);
}

export async function listMovementsByCompany(companyId: string): Promise<StockMovementView[]> {
  const result = await query<{
    id: string;
    company_id: string;
    product_id: string;
    kind: StockMovementKind;
    quantity: string;
    reason: string | null;
    order_id: string | null;
    created_by: string;
    created_at: Date;
    product_name: string;
    product_unit: string;
  }>({
    text: `
      SELECT
        m.*,
        p.name AS product_name,
        p.unit AS product_unit
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      WHERE m.company_id = $1
      ORDER BY m.created_at DESC
    ;`,
    values: [companyId],
  });
  return result.rows.map((r) => {
    const qty = Number(r.quantity);
    return {
      id: r.id,
      company_id: r.company_id,
      product_id: r.product_id,
      kind: r.kind,
      quantity: qty,
      reason: r.reason,
      order_id: r.order_id,
      created_by: r.created_by,
      created_at: r.created_at,
      product_name: r.product_name,
      product_unit: r.product_unit,
      delta: signedDelta(r.kind, qty),
    };
  });
}

// Saldo por produto: agrega movimentos por product_id e left-joina
// products pra incluir produtos sem nenhum movimento (saldo 0).
export async function listBalancesByCompany(companyId: string): Promise<ProductBalance[]> {
  const result = await query<{
    product_id: string;
    product_name: string;
    product_unit: string;
    balance: string | null;
  }>({
    text: `
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.unit AS product_unit,
        COALESCE(SUM(
          CASE
            WHEN m.kind = 'in' THEN m.quantity
            WHEN m.kind = 'out' THEN -m.quantity
            WHEN m.kind = 'adjust' THEN m.quantity
            ELSE 0
          END
        ), 0) AS balance
      FROM products p
      LEFT JOIN stock_movements m ON m.product_id = p.id
      WHERE p.company_id = $1
      GROUP BY p.id, p.name, p.unit
      ORDER BY p.name ASC
    ;`,
    values: [companyId],
  });
  return result.rows.map((r) => ({
    product_id: r.product_id,
    product_name: r.product_name,
    product_unit: r.product_unit,
    balance: Number(r.balance ?? 0),
  }));
}

export async function deleteMovement(id: string): Promise<void> {
  const result = await query({
    text: `DELETE FROM stock_movements WHERE id = $1;`,
    values: [id],
  });
  if (result.rowCount === 0) {
    throw new NotFoundError({
      cause: new Error(`StockMovement ${id} not found`),
      message: "Movimento não encontrado.",
    });
  }
}

export async function deleteMovementsByCompany(companyId: string): Promise<void> {
  await query({
    text: `DELETE FROM stock_movements WHERE company_id = $1;`,
    values: [companyId],
  });
}

function parseMovementRow(row: StockMovement & { quantity: string | number }): StockMovement {
  return { ...row, quantity: Number(row.quantity) };
}

function validateQuantity(kind: StockMovementKind, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > QTY_MAX) {
    throw new ValidationError({ message: "Quantidade inválida." });
  }
  if (kind === "adjust") {
    if (value === 0) {
      throw new ValidationError({
        message: "Ajuste com quantidade zero não tem efeito.",
        action: "Informe um delta positivo ou negativo.",
      });
    }
    return;
  }
  // in / out exigem positivo (o sign vem do kind).
  if (value <= 0) {
    throw new ValidationError({
      message: "Quantidade precisa ser positiva.",
      action: kind === "in" ? "Use entrada para adicionar." : "Use saída para subtrair.",
    });
  }
}

function normalizeReason(reason: unknown): string | null {
  if (reason === undefined || reason === null) return null;
  if (typeof reason !== "string") {
    throw new ValidationError({ message: "Motivo inválido." });
  }
  const trimmed = reason.trim();
  if (!trimmed) return null;
  if (trimmed.length > REASON_MAX) {
    throw new ValidationError({
      message: `Motivo precisa ter no máximo ${REASON_MAX} caracteres.`,
    });
  }
  return trimmed;
}
