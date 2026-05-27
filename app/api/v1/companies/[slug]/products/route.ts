// Catálogo de produtos da empresa.
//
// GET: lista todos os produtos da empresa, gated por read:product.
// POST: cria produto novo, gated por create:product; audit log emite
// product.created. Scope é estritamente por company_id derivado do slug —
// admins de outra empresa não conseguem ler/criar daqui mesmo se trocarem
// o id; isAuthorized faz o lookup de membership.

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { createProduct, listProductsByCompany } from "models/product";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("read:product", { companyId: company.id });
    const products = await listProductsByCompany(company.id);
    return NextResponse.json(products.map(toView));
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("create:product", { companyId: company.id });
    if (!user) throw new AuthenticationError();
    const body = await request.json();
    const product = await createProduct({
      companyId: company.id,
      name: body?.name,
      priceCents: body?.price_cents,
      costCents: typeof body?.cost_cents === "number" ? body.cost_cents : undefined,
      unit: body?.unit,
    });
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "product.created",
      targetType: "product",
      targetId: product.id,
      metadata: {
        name: product.name,
        price_cents: product.price_cents,
        cost_cents: product.cost_cents,
        unit: product.unit,
      },
    });
    return NextResponse.json(toView(product), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}

function toView(p: {
  id: string;
  company_id: string;
  name: string;
  price_cents: number;
  cost_cents: number;
  unit: string;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: p.id,
    company_id: p.company_id,
    name: p.name,
    price_cents: p.price_cents,
    cost_cents: p.cost_cents,
    unit: p.unit,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}
