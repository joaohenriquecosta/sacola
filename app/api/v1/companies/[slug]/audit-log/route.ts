// Read access to the company's audit log. admin+ only via the new
// read:audit_log scoped feature (lives in COMPANY_MANAGEMENT_PERMISSIONS).

import { NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { listAuditEventsByCompany } from "models/audit-log";
import { getCompanyBySlug } from "models/company";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const company = await getCompanyBySlug(slug);
    await canRequest("read:audit_log", { companyId: company.id });
    const events = await listAuditEventsByCompany(company.id);
    return NextResponse.json(events);
  } catch (err) {
    return errorToResponse(err);
  }
}
