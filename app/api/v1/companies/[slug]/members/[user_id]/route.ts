// PATCH/DELETE the membership of a specific user inside a company.
//
// PATCH accepts either form:
//   { role: Role }       — preset switch: rewrites both role and features
//                          to ROLE_PERMISSIONS[role]
//   { features: string[] } — granular: keeps role, replaces features with
//                          the sanitized set (dependencies closed)
//
// "Can edit who" rule lives in @/lib/roles:canEditMember — owner edits
// anyone but themselves; admin/gerente edit only non-management; nobody
// can promote a member to owner via PATCH (transfer flow only).

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import { canEditMember, isValidRole, sanitizeFeatures } from "@/lib/roles";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import {
  deleteMembership,
  getMembership,
  updateMembershipFeatures,
  updateMembershipRole,
} from "models/membership";

type RouteContext = { params: Promise<{ slug: string; user_id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, user_id } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("update:member", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const target = await getMembership(user_id, company.id);
    if (!target) throw new NotFoundError({ message: "Membro não encontrado." });

    const callerMembership = await getMembership(user.id, company.id);
    if (!callerMembership)
      throw new ForbiddenError({ message: "Você não é membro desta empresa." });

    const allowed = canEditMember({
      callerRole: callerMembership.role,
      targetRole: target.role,
      isSelf: target.user_id === user.id,
    });
    if (!allowed) {
      throw new ForbiddenError({
        message: "Você não pode editar este membro.",
        action: "Apenas o dono edita administradores; administradores editam membros comuns.",
      });
    }

    const body = await request.json().catch(() => ({}));

    // Branch on what the client sent.
    if (Array.isArray(body?.features)) {
      const next = sanitizeFeatures(body.features);
      const updated = await updateMembershipFeatures(target.id, next);
      await logSafe({
        companyId: company.id,
        actorId: user.id,
        action: "member.features_changed",
        targetType: "membership",
        targetId: target.id,
        metadata: {
          member_user_id: target.user_id,
          old_features: target.features,
          new_features: updated.features,
        },
      });
      return NextResponse.json({
        id: updated.id,
        user_id: updated.user_id,
        company_id: updated.company_id,
        role: updated.role,
        features: updated.features,
        updated_at: updated.updated_at,
      });
    }

    // Role preset switch.
    if (!isValidRole(body?.role)) {
      throw new ValidationError({
        message: "Envie role ou features.",
        action: "Use { role: '...' } para um preset ou { features: [...] } para granular.",
      });
    }
    if (body.role === "owner") {
      throw new ForbiddenError({
        message: "Não é possível promover outro membro a dono.",
        action: "Use o fluxo de transferência de propriedade.",
      });
    }

    const updated = await updateMembershipRole(target.id, body.role);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "member.role_changed",
      targetType: "membership",
      targetId: target.id,
      metadata: {
        member_user_id: target.user_id,
        old_role: target.role,
        new_role: updated.role,
      },
    });
    return NextResponse.json({
      id: updated.id,
      user_id: updated.user_id,
      company_id: updated.company_id,
      role: updated.role,
      features: updated.features,
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
    const { user } = await canRequest("delete:member", { companyId: company.id });
    if (!user) throw new ForbiddenError({ message: "Sessão necessária." });

    if (user.id === user_id) {
      // Self-removal goes through the dedicated /members/me path. Forcing
      // the split keeps the permission stories separate: removing somebody
      // else requires delete:member, leaving yourself doesn't.
      throw new ForbiddenError({
        message: "Use o caminho de sair da empresa para se remover.",
        action: "DELETE /api/v1/companies/[slug]/members/me",
      });
    }

    const target = await getMembership(user_id, company.id);
    if (!target) throw new NotFoundError({ message: "Membro não encontrado." });

    const callerMembership = await getMembership(user.id, company.id);
    if (!callerMembership)
      throw new ForbiddenError({ message: "Você não é membro desta empresa." });

    const allowed = canEditMember({
      callerRole: callerMembership.role,
      targetRole: target.role,
      isSelf: false,
    });
    if (!allowed) {
      throw new ForbiddenError({
        message: "Você não pode remover este membro.",
        action: "Administradores só removem membros comuns.",
      });
    }

    await deleteMembership(target.id);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "member.removed",
      targetType: "membership",
      targetId: target.id,
      metadata: { member_user_id: target.user_id, removed_role: target.role },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
