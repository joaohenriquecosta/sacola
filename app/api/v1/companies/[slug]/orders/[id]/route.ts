// Single pedido: GET (detalhe + itens), PATCH (status), DELETE.
//
// PATCH status: MVP permite mover livre entre os 4 estados pra qualquer
// caller com update:order. PR de lifecycle (issue #12) vai introduzir
// matriz de transições válidas + autorização por estado-de-destino.
//
// Cross-tenant: 404 quando o pedido não pertence à empresa do slug.

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, NotFoundError, ValidationError } from "infra/errors";
import { findTransition } from "@/lib/order-status";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { deleteOrderById, getOrderById, isValidOrderStatus, updateOrderStatus } from "models/order";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("read:order", { companyId: company.id });
    const order = await getOrderById(id);
    if (order.company_id !== company.id) {
      throw new NotFoundError({ message: "Pedido não encontrado." });
    }
    return NextResponse.json(order);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    // Carregamos o pedido antes da autorização — precisamos do estado
    // atual + alvo pra derivar a feature exigida e gatear nela.
    const body = await request.json().catch(() => ({}));
    if (!isValidOrderStatus(body?.status)) {
      throw new ValidationError({
        message: "Status inválido.",
        action: "Use separado | entregue | cancelado (criado só na criação).",
      });
    }
    const transition = findTransition(body.status);
    if (!transition) {
      throw new ValidationError({
        message: "Esse estado não é alvo de transição.",
        action: "criado é o estado inicial; um pedido novo nasce criado.",
      });
    }

    const { user } = await canRequest(transition.feature, { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const existing = await getOrderById(id);
    if (existing.company_id !== company.id) {
      throw new NotFoundError({ message: "Pedido não encontrado." });
    }

    // Matrix enforcement: updateOrderStatus lança ValidationError se a
    // transição não for válida a partir do estado atual.
    const updated = await updateOrderStatus(id, existing.status, body.status);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "order.status_changed",
      targetType: "order",
      targetId: updated.id,
      metadata: { old_status: existing.status, new_status: updated.status },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("delete:order", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const existing = await getOrderById(id);
    if (existing.company_id !== company.id) {
      throw new NotFoundError({ message: "Pedido não encontrado." });
    }

    await deleteOrderById(id);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "order.deleted",
      targetType: "order",
      targetId: existing.id,
      metadata: { total_cents: existing.total_cents, status_at_delete: existing.status },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
