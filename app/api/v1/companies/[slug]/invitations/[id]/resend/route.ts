// Resend a pending invitation. Rotates the token so a forwarded copy of the
// old email stops working, then re-sends. Admin/owner only.

import { NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, ForbiddenError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { getInvitationById, resendInvitation } from "models/invitation";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("create:invitation", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    // Same defense-in-depth check used by DELETE: the invitation must
    // belong to this company URL.
    const invitation = await getInvitationById(id);
    if (invitation.company_id !== company.id) {
      throw new ForbiddenError({ message: "Convite não pertence a esta empresa." });
    }

    const resent = await resendInvitation(id);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "invitation.resent",
      targetType: "invitation",
      targetId: resent.id,
      metadata: { email: resent.email, role: resent.role },
    });
    return NextResponse.json(
      {
        id: resent.id,
        email: resent.email,
        role: resent.role,
        expires_at: resent.expires_at,
      },
      { status: 202 },
    );
  } catch (err) {
    return errorToResponse(err);
  }
}
