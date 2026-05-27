// Single product: PATCH (update fields) e DELETE.
//
// Cross-tenant guard: o produto precisa pertencer à mesma empresa cujo slug
// está na URL. Se não bate, NotFoundError — não vazamos a existência de um
// produto de outra empresa via id.

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, NotFoundError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { deleteProduct, getProductById, updateProduct } from "models/product";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("update:product", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const existing = await getProductById(id);
    if (existing.company_id !== company.id) {
      throw new NotFoundError({ message: "Produto não encontrado." });
    }

    const body = await request.json().catch(() => ({}));
    const updated = await updateProduct(id, {
      name: typeof body?.name === "string" ? body.name : undefined,
      priceCents: typeof body?.price_cents === "number" ? body.price_cents : undefined,
      costCents: typeof body?.cost_cents === "number" ? body.cost_cents : undefined,
      unit: typeof body?.unit === "string" ? body.unit : undefined,
    });
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "product.updated",
      targetType: "product",
      targetId: updated.id,
      metadata: {
        old: {
          name: existing.name,
          price_cents: existing.price_cents,
          cost_cents: existing.cost_cents,
          unit: existing.unit,
        },
        new: {
          name: updated.name,
          price_cents: updated.price_cents,
          cost_cents: updated.cost_cents,
          unit: updated.unit,
        },
      },
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
    const { user } = await canRequest("delete:product", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const existing = await getProductById(id);
    if (existing.company_id !== company.id) {
      throw new NotFoundError({ message: "Produto não encontrado." });
    }

    await deleteProduct(id);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "product.deleted",
      targetType: "product",
      targetId: existing.id,
      metadata: { name: existing.name },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
