import { NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { ForbiddenError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { deleteInvitationById, getInvitationById } from "models/invitation";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("delete:invitation", { companyId: company.id });
    const invitation = await getInvitationById(id);
    if (invitation.company_id !== company.id) {
      // Defense in depth: token id under one company URL must not delete an
      // invitation belonging to another company.
      throw new ForbiddenError({
        message: "Convite não pertence a esta empresa.",
      });
    }
    await deleteInvitationById(invitation.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
