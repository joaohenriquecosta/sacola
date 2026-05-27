import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse, loadCurrentUser } from "infra/controller";
import { AuthenticationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { filterOutput } from "models/authorization";
import { createCompany, listCompaniesForUser } from "models/company";

export async function POST(request: NextRequest) {
  try {
    const { user } = await canRequest("create:company");
    if (!user) throw new AuthenticationError();
    const body = await request.json();
    const company = await createCompany({
      name: body?.name,
      slug: body?.slug,
      ownerUserId: user.id,
    });
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "company.created",
      targetType: "company",
      targetId: company.id,
      metadata: { name: company.name, slug: company.slug },
    });
    const filtered = filterOutput(
      { id: user.id, features: user.features },
      "read:company",
      company as unknown as Record<string, unknown>,
    );
    return NextResponse.json({ ...filtered, role: "owner" }, { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}

// Listing the requesting user's own memberships — no permission check beyond
// "is logged in". Each row already includes the role for the caller.
export async function GET() {
  try {
    const { user } = await loadCurrentUser();
    if (!user) {
      throw new AuthenticationError({
        cause: new Error("GET /api/v1/companies without an active session"),
        message: "Sessão inválida.",
        action: "Faça login para continuar.",
      });
    }
    const companies = await listCompaniesForUser(user.id);
    return NextResponse.json(companies);
  } catch (err) {
    return errorToResponse(err);
  }
}
