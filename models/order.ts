// Pedido + itens. Cada item snapshota nome/unit/preço do produto no
// momento da criação — alterações futuras no produto não retroagem.
// Cross-tenant guard: rotas verificam que o client/products pertencem à
// mesma empresa.
//
// MVP do lifecycle: status livre em ('criado'|'separado'|'entregue'|
// 'cancelado'), qualquer um com update:order pode mover. PR de lifecycle
// (issue #12) vai refinar com regras de transição.

import { query } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";
import {
  ORDER_STATUSES,
  isValidOrderStatus,
  isValidTransition,
  type OrderStatus,
} from "@/lib/order-status";

// Re-export pra callers existentes do model não precisarem mudar import.
// Client components devem importar direto de @/lib/order-status pra evitar
// puxar a DB layer pro bundle do browser.
export { ORDER_STATUSES, isValidOrderStatus };
export type { OrderStatus };

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_unit: string;
  unit_price_cents: number;
  // numeric(10,3) chega como string do pg driver por padrão; convertemos
  // pra number em listOrderItems pra UI tratar uniforme.
  quantity: number;
  subtotal_cents: number;
  // Peso real (g) registrado na separação; null até pesar. numeric(10,3),
  // convertido pra number como quantity.
  gramas_separado: number | null;
  created_at: Date;
};

export type Order = {
  id: string;
  company_id: string;
  client_id: string;
  created_by: string;
  status: OrderStatus;
  total_cents: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export type OrderWithItems = Order & {
  items: OrderItem[];
  // Computed reading-time: cliente.name é útil mostrando lista sem N
  // round-trips. O caller pode usar listOrdersWithMeta abaixo.
};

export type OrderListView = Order & {
  client_name: string;
  item_count: number;
};

const PRICE_MAX_CENTS = 100_000_000;
const QTY_MIN = 0.001;
const QTY_MAX = 99_999_999.999;

export type CreateOrderItemInput = {
  productId: string;
  productName: string;
  productUnit: string;
  unitPriceCents: number;
  quantity: number;
};

export type CreateOrderInput = {
  companyId: string;
  clientId: string;
  createdBy: string;
  notes?: string | null;
  items: readonly CreateOrderItemInput[];
};

export async function createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
  if (input.items.length === 0) {
    throw new ValidationError({
      message: "Um pedido precisa de pelo menos um item.",
      action: "Adicione um produto antes de salvar.",
    });
  }

  // Validate + compute totals server-side (UI total é só dica visual; a
  // verdade está aqui).
  let totalCents = 0;
  const lines = input.items.map((item) => {
    validateMoney(item.unitPriceCents, "preço");
    validateQuantity(item.quantity);
    const subtotal = Math.round(item.unitPriceCents * item.quantity);
    if (subtotal > PRICE_MAX_CENTS) {
      throw new ValidationError({ message: "Subtotal do item excede o limite." });
    }
    totalCents += subtotal;
    return { ...item, subtotalCents: subtotal };
  });
  if (totalCents > PRICE_MAX_CENTS) {
    throw new ValidationError({ message: "Total do pedido excede o limite." });
  }

  // Sem transaction (convenção do projeto: client-per-query). Se a inserção
  // de algum item falhar depois da order, fazemos compensação apagando a
  // order — assim nunca fica order órfã com itens parciais.
  const orderResult = await query<Order>({
    text: `
      INSERT INTO orders (company_id, client_id, created_by, total_cents, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    ;`,
    values: [
      input.companyId,
      input.clientId,
      input.createdBy,
      totalCents,
      input.notes?.trim() || null,
    ],
  });
  const order = orderResult.rows[0];

  try {
    for (const line of lines) {
      await query({
        text: `
          INSERT INTO order_items
            (order_id, product_id, product_name, product_unit,
             unit_price_cents, quantity, subtotal_cents)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        ;`,
        values: [
          order.id,
          line.productId,
          line.productName,
          line.productUnit,
          line.unitPriceCents,
          line.quantity,
          line.subtotalCents,
        ],
      });
    }
  } catch (error) {
    await deleteOrderById(order.id).catch(() => {});
    throw error;
  }

  const items = await listOrderItems(order.id);
  return { ...order, items };
}

export async function getOrderById(id: string): Promise<OrderWithItems> {
  const result = await query<Order>({
    text: `SELECT * FROM orders WHERE id = $1 LIMIT 1;`,
    values: [id],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`Order ${id} not found`),
      message: "Pedido não encontrado.",
    });
  }
  const items = await listOrderItems(id);
  return { ...result.rows[0], items };
}

export async function listOrdersByCompany(companyId: string): Promise<OrderListView[]> {
  const result = await query<{
    id: string;
    company_id: string;
    client_id: string;
    created_by: string;
    status: OrderStatus;
    total_cents: number;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    client_name: string;
    item_count: string;
  }>({
    text: `
      SELECT
        o.*,
        c.name AS client_name,
        (SELECT COUNT(*)::text FROM order_items oi WHERE oi.order_id = o.id) AS item_count
      FROM orders o
      JOIN clients c ON c.id = o.client_id
      WHERE o.company_id = $1
      ORDER BY o.created_at DESC
    ;`,
    values: [companyId],
  });
  return result.rows.map((r) => ({
    id: r.id,
    company_id: r.company_id,
    client_id: r.client_id,
    created_by: r.created_by,
    status: r.status,
    total_cents: r.total_cents,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
    client_name: r.client_name,
    item_count: Number(r.item_count),
  }));
}

export async function listOrderItems(orderId: string): Promise<OrderItem[]> {
  const result = await query<{
    id: string;
    order_id: string;
    product_id: string;
    product_name: string;
    product_unit: string;
    unit_price_cents: number;
    quantity: string;
    subtotal_cents: number;
    gramas_separado: string | null;
    created_at: Date;
  }>({
    text: `
      SELECT *
      FROM order_items
      WHERE order_id = $1
      ORDER BY created_at ASC
    ;`,
    values: [orderId],
  });
  return result.rows.map((r) => ({
    id: r.id,
    order_id: r.order_id,
    product_id: r.product_id,
    product_name: r.product_name,
    product_unit: r.product_unit,
    unit_price_cents: r.unit_price_cents,
    quantity: Number(r.quantity),
    subtotal_cents: r.subtotal_cents,
    gramas_separado: r.gramas_separado != null ? Number(r.gramas_separado) : null,
    created_at: r.created_at,
  }));
}

// Move status enforçando a matriz de transições. Caller (route) faz o
// gate de autorização pela feature derivada da transição; aqui validamos
// só o aspecto de máquina-de-estados: o pedido pode ir do estado atual
// para o alvo?
export async function updateOrderStatus(
  id: string,
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
): Promise<Order> {
  if (!isValidOrderStatus(nextStatus)) {
    throw new ValidationError({
      message: "Status inválido.",
      action: `Use um de: ${ORDER_STATUSES.join(", ")}.`,
    });
  }
  if (!isValidTransition(currentStatus, nextStatus)) {
    throw new ValidationError({
      cause: new Error(`Invalid transition ${currentStatus} → ${nextStatus}`),
      message: `Não é possível ir de "${currentStatus}" para "${nextStatus}".`,
      action: "Veja as transições válidas em lib/order-status.ts.",
    });
  }
  const result = await query<Order>({
    text: `
      UPDATE orders
      SET status = $2,
          updated_at = timezone('utc', now())
      WHERE id = $1
      RETURNING *
    ;`,
    values: [id, nextStatus],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`Order ${id} not found`),
      message: "Pedido não encontrado.",
    });
  }
  return result.rows[0];
}

// Registra o peso real (gramas) separado por item. Um UPDATE por item
// (convenção client-per-query do projeto). Só afeta itens do próprio pedido;
// a rota valida posse + permissão antes de chamar.
export async function recordSeparationWeights(
  orderId: string,
  weights: readonly { itemId: string; gramas: number }[],
): Promise<void> {
  for (const w of weights) {
    await query({
      text: `
        UPDATE order_items
        SET gramas_separado = $1
        WHERE id = $2 AND order_id = $3
      ;`,
      values: [w.gramas, w.itemId, orderId],
    });
  }
}

export async function deleteOrderById(id: string): Promise<void> {
  // Itens vão junto via cascade aplicacional.
  await query({ text: `DELETE FROM order_items WHERE order_id = $1;`, values: [id] });
  await query({ text: `DELETE FROM orders WHERE id = $1;`, values: [id] });
}

export async function deleteOrdersByCompany(companyId: string): Promise<void> {
  // Apaga itens primeiro (sem FK constraints, segue o padrão de cascades
  // aplicacionais do projeto).
  await query({
    text: `
      DELETE FROM order_items
      WHERE order_id IN (SELECT id FROM orders WHERE company_id = $1)
    ;`,
    values: [companyId],
  });
  await query({
    text: `DELETE FROM orders WHERE company_id = $1;`,
    values: [companyId],
  });
}

function validateMoney(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > PRICE_MAX_CENTS
  ) {
    throw new ValidationError({
      message: `${label} inválido.`,
      action: `Informe o ${label} em centavos (inteiro não negativo).`,
    });
  }
}

function validateQuantity(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < QTY_MIN || value > QTY_MAX) {
    throw new ValidationError({
      message: "Quantidade inválida.",
      action: `Use um valor entre ${QTY_MIN} e ${QTY_MAX}.`,
    });
  }
}
