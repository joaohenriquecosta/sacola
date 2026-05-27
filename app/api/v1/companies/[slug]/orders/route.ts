// Pedidos da empresa.
//
// GET: lista (com client_name + item_count) — gated por read:order.
// POST: cria pedido com itens. Cliente + produtos passados pelo body são
// re-validados aqui pra garantir que pertencem à mesma empresa (anti
// privilege-escalation: nada de ligar produto da empresa A num pedido
// da empresa B via id).

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, NotFoundError, ValidationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getClientById } from "models/client";
import { getCompanyBySlug } from "models/company";
import { createOrder, listOrdersByCompany } from "models/order";
import { getProductById } from "models/product";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("read:order", { companyId: company.id });
    const orders = await listOrdersByCompany(company.id);
    return NextResponse.json(orders);
  } catch (err) {
    return errorToResponse(err);
  }
}

type IncomingItem = {
  product_id?: unknown;
  quantity?: unknown;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("create:order", { companyId: company.id });
    if (!user) throw new AuthenticationError();
    const body = await request.json();

    if (typeof body?.client_id !== "string") {
      throw new ValidationError({
        message: "client_id é obrigatório.",
        action: "Selecione um cliente.",
      });
    }
    const client = await getClientById(body.client_id);
    if (client.company_id !== company.id) {
      // Cliente de outra empresa: 404 (anti-enum, igual aos PATCHs).
      throw new NotFoundError({ message: "Cliente não encontrado." });
    }

    if (!Array.isArray(body?.items) || body.items.length === 0) {
      throw new ValidationError({
        message: "Pedido precisa de pelo menos um item.",
        action: "Adicione um produto.",
      });
    }

    // Resolve cada item: pega snapshot do produto + valida tenant. Faz N
    // round-trips, OK pro MVP (50 pedidos/dia, tipicamente 5-15 itens).
    // Otimização futura: SELECT IN (...).
    const resolved = await Promise.all(
      (body.items as IncomingItem[]).map(async (raw) => {
        if (typeof raw.product_id !== "string" || typeof raw.quantity !== "number") {
          throw new ValidationError({
            message: "Item de pedido inválido.",
            action: "Cada item precisa de product_id (uuid) e quantity (número).",
          });
        }
        const product = await getProductById(raw.product_id);
        if (product.company_id !== company.id) {
          throw new NotFoundError({ message: "Produto não encontrado." });
        }
        return {
          productId: product.id,
          productName: product.name,
          productUnit: product.unit,
          unitPriceCents: product.price_cents,
          quantity: raw.quantity,
        };
      }),
    );

    const created = await createOrder({
      companyId: company.id,
      clientId: client.id,
      createdBy: user.id,
      notes: typeof body?.notes === "string" ? body.notes : null,
      items: resolved,
    });

    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "order.created",
      targetType: "order",
      targetId: created.id,
      metadata: {
        client_id: created.client_id,
        client_name: client.name,
        total_cents: created.total_cents,
        item_count: created.items.length,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
