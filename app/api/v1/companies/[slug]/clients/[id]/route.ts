// Single client: PATCH e DELETE.
//
// Cross-tenant guard: o cliente precisa pertencer à empresa cujo slug está
// na URL. Se não bate, 404 (anti-enum: não vazamos a existência de cliente
// de outra empresa via id).

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, NotFoundError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { deleteClient, getClientById, updateClient } from "models/client";
import { getCompanyBySlug } from "models/company";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("update:client", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const existing = await getClientById(id);
    if (existing.company_id !== company.id) {
      throw new NotFoundError({ message: "Cliente não encontrado." });
    }

    const body = await request.json().catch(() => ({}));
    const updated = await updateClient(id, {
      name: typeof body?.name === "string" ? body.name : undefined,
      phone: body?.phone === null || typeof body?.phone === "string" ? body.phone : undefined,
      notes: body?.notes === null || typeof body?.notes === "string" ? body.notes : undefined,
    });
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "client.updated",
      targetType: "client",
      targetId: updated.id,
      metadata: {
        old: { name: existing.name, phone: existing.phone },
        new: { name: updated.name, phone: updated.phone },
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("delete:client", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const existing = await getClientById(id);
    if (existing.company_id !== company.id) {
      throw new NotFoundError({ message: "Cliente não encontrado." });
    }

    await deleteClient(id);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "client.deleted",
      targetType: "client",
      targetId: existing.id,
      metadata: { name: existing.name },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
