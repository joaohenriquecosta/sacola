// PATCH/DELETE the membership of a specific user inside a company.
//
// Owner protection: the owner can't be demoted or removed via this endpoint.
// To "transfer ownership" we'd need a dedicated flow that promotes a new
// owner atomically — out of scope for MVP.

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import { isValidRole } from "models/authorization";
import { getCompanyBySlug } from "models/company";
import { deleteMembership, getMembership, updateMembershipRole } from "models/membership";

type RouteContext = { params: Promise<{ slug: string; user_id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, user_id } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("update:member", { companyId: company.id });

    const target = await getMembership(user_id, company.id);
    if (!target) throw new NotFoundError({ message: "Membro não encontrado." });
    if (target.role === "owner") {
      throw new ForbiddenError({
        message: "Não é possível alterar a role do dono da empresa.",
        action: "Transfira a propriedade primeiro.",
      });
    }

    const body = await request.json();
    if (!isValidRole(body?.role)) {
      throw new ValidationError({
        message: "Role inválida.",
        action: "Use uma role válida.",
      });
    }
    if (body.role === "owner") {
      throw new ForbiddenError({
        message: "Não é possível promover outro membro a dono.",
        action: "Use o fluxo de transferência de propriedade.",
      });
    }

    const updated = await updateMembershipRole(target.id, body.role);
    return NextResponse.json({
      id: updated.id,
      user_id: updated.user_id,
      company_id: updated.company_id,
      role: updated.role,
      updated_at: updated.updated_at,
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { slug, user_id } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("delete:member", { companyId: company.id });

    const target = await getMembership(user_id, company.id);
    if (!target) throw new NotFoundError({ message: "Membro não encontrado." });
    if (target.role === "owner") {
      throw new ForbiddenError({
        message: "Não é possível remover o dono da empresa.",
        action: "Transfira a propriedade primeiro.",
      });
    }

    await deleteMembership(target.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
