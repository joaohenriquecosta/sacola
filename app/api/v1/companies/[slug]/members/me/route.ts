// Self-leave. The caller removes their own membership. Owners cannot leave
// directly — they must transfer the company first (otherwise it would sit
// without any owner, the worst possible state).
//
// This is intentionally a separate path from DELETE /members/[user_id]
// (which is the admin-removes-someone-else flow). Treating them as the same
// endpoint would collapse two different permission stories: removing
// somebody else needs `delete:member`; leaving yourself needs no special
// permission — the user owns their own membership.

import { NextResponse } from "next/server";

import { errorToResponse, loadCurrentUser } from "infra/controller";
import { AuthenticationError, ForbiddenError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { deleteMembership, getMembership } from "models/membership";

type RouteContext = { params: Promise<{ slug: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const { user } = await loadCurrentUser();
    if (!user) {
      throw new AuthenticationError({
        cause: new Error("DELETE /members/me without an active session"),
        message: "Sessão inválida.",
        action: "Faça login para continuar.",
      });
    }

    const company = await getCompanyBySlug(slug);
    const membership = await getMembership(user.id, company.id);
    if (!membership) {
      // Idempotent: not a member, so nothing to leave.
      return new NextResponse(null, { status: 204 });
    }

    if (membership.role === "owner") {
      throw new ForbiddenError({
        message: "Você é o dono desta empresa.",
        action: "Transfira a propriedade para outro membro antes de sair.",
      });
    }

    await deleteMembership(membership.id);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "member.left",
      targetType: "membership",
      targetId: membership.id,
      metadata: { role: membership.role },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
