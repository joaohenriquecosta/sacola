// GET /stock — saldo por produto da empresa (left join com products,
// inclusive os sem nenhum movimento, com balance 0). Gated por
// read:stock_movement.

import { NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { getCompanyBySlug } from "models/company";
import { listBalancesByCompany } from "models/stock";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("read:stock_movement", { companyId: company.id });
    const balances = await listBalancesByCompany(company.id);
    return NextResponse.json(balances);
  } catch (err) {
    return errorToResponse(err);
  }
}
