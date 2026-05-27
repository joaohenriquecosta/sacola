import { NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError } from "infra/errors";
import { filterOutput } from "models/authorization";
import { getCompanyBySlug } from "models/company";
import { listMembersByCompany } from "models/membership";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("read:member", { companyId: company.id });
    if (!user) throw new AuthenticationError();
    const members = await listMembersByCompany(company.id);
    const filtered = members.map((m) =>
      filterOutput(
        { id: user.id, features: user.features },
        "read:member",
        m as unknown as Record<string, unknown>,
      ),
    );
    return NextResponse.json(filtered);
  } catch (err) {
    return errorToResponse(err);
  }
}
