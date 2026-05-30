// Pagamentos: zero, um ou vários por pedido. amount_cents sempre > 0;
// estorno é DELETE. Saldo do pedido = order.total_cents - SUM(payments).

import { query } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";
import { PAYMENT_METHODS, isValidPaymentMethod, type PaymentMethod } from "@/lib/payment-method";

export { PAYMENT_METHODS, isValidPaymentMethod };
export type { PaymentMethod };

export type Payment = {
  id: string;
  company_id: string;
  order_id: string;
  amount_cents: number;
  method: PaymentMethod;
  paid_at: Date;
  notes: string | null;
  created_by: string;
  created_at: Date;
};

const AMOUNT_MAX_CENTS = 100_000_000;
const NOTES_MAX = 120;

export type CreatePaymentInput = {
  companyId: string;
  orderId: string;
  amountCents: number;
  method: PaymentMethod;
  paidAt?: Date | null;
  notes?: string | null;
  createdBy: string;
};

export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  if (!isValidPaymentMethod(input.method)) {
    throw new ValidationError({
      message: "Método de pagamento inválido.",
      action: `Use um de: ${PAYMENT_METHODS.join(", ")}.`,
    });
  }
  validateAmount(input.amountCents);
  const notes = normalizeNotes(input.notes);

  const result = await query<Payment>({
    text: `
      INSERT INTO payments
        (company_id, order_id, amount_cents, method, paid_at, notes, created_by)
      VALUES ($1, $2, $3, $4, COALESCE($5, timezone('utc', now())), $6, $7)
      RETURNING *
    ;`,
    values: [
      input.companyId,
      input.orderId,
      input.amountCents,
      input.method,
      input.paidAt ?? null,
      notes,
      input.createdBy,
    ],
  });
  return result.rows[0];
}

export async function getPaymentById(id: string): Promise<Payment> {
  const result = await query<Payment>({
    text: `SELECT * FROM payments WHERE id = $1 LIMIT 1;`,
    values: [id],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`Payment ${id} not found`),
      message: "Pagamento não encontrado.",
    });
  }
  return result.rows[0];
}

export async function listPaymentsByOrder(orderId: string): Promise<Payment[]> {
  const result = await query<Payment>({
    text: `
      SELECT *
      FROM payments
      WHERE order_id = $1
      ORDER BY paid_at DESC
    ;`,
    values: [orderId],
  });
  return result.rows;
}

// Consolida os pagamentos da empresa pra a tela /pagamentos, já trazendo o
// cliente de cada pedido (JOIN) pra a UI não fazer N lookups.
export type PaymentListView = Payment & { client_name: string };

export async function listPaymentsByCompany(companyId: string): Promise<PaymentListView[]> {
  const result = await query<PaymentListView>({
    text: `
      SELECT p.*, c.name AS client_name
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      JOIN clients c ON c.id = o.client_id
      WHERE p.company_id = $1
      ORDER BY p.paid_at DESC
    ;`,
    values: [companyId],
  });
  return result.rows;
}

// Soma paga em um pedido. Usado pra calcular saldo a pagar
// (order.total_cents - sumPaidForOrder).
export async function sumPaidForOrder(orderId: string): Promise<number> {
  const result = await query<{ total: string | null }>({
    text: `SELECT COALESCE(SUM(amount_cents), 0)::text AS total FROM payments WHERE order_id = $1;`,
    values: [orderId],
  });
  return Number(result.rows[0].total ?? 0);
}

export async function deletePayment(id: string): Promise<void> {
  const result = await query({
    text: `DELETE FROM payments WHERE id = $1;`,
    values: [id],
  });
  if (result.rowCount === 0) {
    throw new NotFoundError({
      cause: new Error(`Payment ${id} not found`),
      message: "Pagamento não encontrado.",
    });
  }
}

export async function deletePaymentsByCompany(companyId: string): Promise<void> {
  await query({
    text: `DELETE FROM payments WHERE company_id = $1;`,
    values: [companyId],
  });
}

function validateAmount(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > AMOUNT_MAX_CENTS
  ) {
    throw new ValidationError({
      message: "Valor inválido.",
      action: "Informe o valor em centavos (inteiro positivo).",
    });
  }
}

function normalizeNotes(notes: unknown): string | null {
  if (notes === undefined || notes === null) return null;
  if (typeof notes !== "string") {
    throw new ValidationError({ message: "Observações inválidas." });
  }
  const trimmed = notes.trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTES_MAX) {
    throw new ValidationError({
      message: `Observações precisam ter no máximo ${NOTES_MAX} caracteres.`,
    });
  }
  return trimmed;
}
