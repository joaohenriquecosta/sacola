// Histórico de movimentos da empresa + POST de movimento novo.
//
// POST cross-tenant guard: produto precisa pertencer à empresa do slug
// (anti privilege escalation).

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, NotFoundError, ValidationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { getProductById } from "models/product";
import { createMovement, listMovementsByCompany } from "models/stock";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("read:stock_movement", { companyId: company.id });
    const movements = await listMovementsByCompany(company.id);
    return NextResponse.json(movements);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("create:stock_movement", { companyId: company.id });
    if (!user) throw new AuthenticationError();
    const body = await request.json();

    if (typeof body?.product_id !== "string") {
      throw new ValidationError({
        message: "product_id é obrigatório.",
        action: "Selecione um produto.",
      });
    }
    const product = await getProductById(body.product_id);
    if (product.company_id !== company.id) {
      throw new NotFoundError({ message: "Produto não encontrado." });
    }

    const movement = await createMovement({
      companyId: company.id,
      productId: product.id,
      kind: body?.kind,
      quantity: body?.quantity,
      reason: typeof body?.reason === "string" ? body.reason : null,
      orderId: null,
      createdBy: user.id,
    });

    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "stock.movement_created",
      targetType: "stock_movement",
      targetId: movement.id,
      metadata: {
        product_id: product.id,
        product_name: product.name,
        kind: movement.kind,
        quantity: movement.quantity,
        reason: movement.reason,
      },
    });

    return NextResponse.json(movement, { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
