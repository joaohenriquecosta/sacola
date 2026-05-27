// Atomic ownership transfer: the current owner becomes admin, the named user
// becomes owner. Guarded by delete:company (effectively owner-only — admin
// can't transfer because they don't hold the role to give).

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, ValidationError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { transferOwnership } from "models/membership";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("delete:company", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const body = await request.json().catch(() => ({}));
    if (typeof body?.user_id !== "string" || !body.user_id) {
      throw new ValidationError({
        message: "user_id é obrigatório.",
        action: "Informe o id do membro que deve assumir a propriedade.",
      });
    }

    const { newOwner, demotedOwner } = await transferOwnership({
      companyId: company.id,
      currentOwnerUserId: user.id,
      newOwnerUserId: body.user_id,
    });

    return NextResponse.json({
      new_owner: { user_id: newOwner.user_id, role: newOwner.role },
      former_owner: { user_id: demotedOwner.user_id, role: demotedOwner.role },
    });
  } catch (err) {
    return errorToResponse(err);
  }
}
