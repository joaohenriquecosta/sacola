// Carteira de clientes da empresa.
//
// GET: lista todos os clientes da empresa, gated por read:client.
// POST: cria cliente novo, gated por create:client; audit log emite
// client.created. Scope é estritamente por company_id derivado do slug.

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { createClient, listClientsByCompany } from "models/client";
import { getCompanyBySlug } from "models/company";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("read:client", { companyId: company.id });
    const clients = await listClientsByCompany(company.id);
    return NextResponse.json(clients);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("create:client", { companyId: company.id });
    if (!user) throw new AuthenticationError();
    const body = await request.json();
    const created = await createClient({
      companyId: company.id,
      name: body?.name,
      phone: typeof body?.phone === "string" ? body.phone : null,
      notes: typeof body?.notes === "string" ? body.notes : null,
    });
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "client.created",
      targetType: "client",
      targetId: created.id,
      metadata: { name: created.name, phone: created.phone },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
