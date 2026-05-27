// DELETE de movimento = estorno. Caller deve registrar um movimento
// novo com motivo se quiser preservar o histórico. Cross-tenant: 404
// quando o movimento não pertence à empresa do slug.

import { NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, NotFoundError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { deleteMovement, getMovementById } from "models/stock";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("delete:stock_movement", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const existing = await getMovementById(id);
    if (existing.company_id !== company.id) {
      throw new NotFoundError({ message: "Movimento não encontrado." });
    }

    await deleteMovement(id);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "stock.movement_deleted",
      targetType: "stock_movement",
      targetId: existing.id,
      metadata: {
        product_id: existing.product_id,
        kind: existing.kind,
        quantity: existing.quantity,
      },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
