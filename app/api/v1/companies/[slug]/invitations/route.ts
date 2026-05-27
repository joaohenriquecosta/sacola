import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { createInvitation, listInvitationsByCompany } from "models/invitation";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("read:invitation", { companyId: company.id });
    const invitations = await listInvitationsByCompany(company.id);
    // Strip the token before returning — the listing is for the company admin
    // to see who's pending, not to re-send the link.
    return NextResponse.json(
      invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expires_at: i.expires_at,
        created_at: i.created_at,
      })),
    );
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("create:invitation", { companyId: company.id });
    if (!user) throw new AuthenticationError();
    const body = await request.json();
    const invitation = await createInvitation({
      companyId: company.id,
      email: body?.email,
      role: body?.role,
      features: Array.isArray(body?.features) ? body.features : undefined,
      invitedBy: user.id,
    });
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "invitation.created",
      targetType: "invitation",
      targetId: invitation.id,
      metadata: {
        email: invitation.email,
        role: invitation.role,
        features: invitation.features,
      },
    });
    return NextResponse.json(
      {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        features: invitation.features,
        expires_at: invitation.expires_at,
        created_at: invitation.created_at,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorToResponse(err);
  }
}
