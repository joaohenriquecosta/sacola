import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse, loadCurrentUser } from "infra/controller";
import { AuthenticationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { filterOutput } from "models/authorization";
import {
  deleteCompanyById,
  getCompanyBySlug,
  updateCompany,
  type UpdateCompanyInput,
} from "models/company";
import { getMembership } from "models/membership";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("read:company", { companyId: company.id });
    if (!user) throw new AuthenticationError();
    const membership = await getMembership(user.id, company.id);
    const filtered = filterOutput(
      { id: user.id, features: user.features },
      "read:company",
      company as unknown as Record<string, unknown>,
    );
    return NextResponse.json({ ...filtered, role: membership?.role ?? null });
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("update:company", { companyId: company.id });
    if (!user) throw new AuthenticationError();
    const body = await request.json();
    const patch: UpdateCompanyInput = {};
    if (typeof body?.name === "string") patch.name = body.name;
    if (typeof body?.slug === "string") patch.slug = body.slug;
    const updated = await updateCompany(company.id, patch);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "company.updated",
      targetType: "company",
      targetId: company.id,
      metadata: {
        ...(patch.name !== undefined && { old_name: company.name, new_name: updated.name }),
        ...(patch.slug !== undefined && { old_slug: company.slug, new_slug: updated.slug }),
      },
    });
    const filtered = filterOutput(
      { id: user.id, features: user.features },
      "read:company",
      updated as unknown as Record<string, unknown>,
    );
    return NextResponse.json(filtered);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("delete:company", { companyId: company.id });
    await deleteCompanyById(company.id);
    // Sanity: clear any stale loadCurrentUser cache the caller might keep.
    await loadCurrentUser();
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
