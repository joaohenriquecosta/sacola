// Lista + registra pagamentos de um pedido. Cross-tenant: order
// precisa pertencer à empresa do slug; pedido cancelado não aceita
// pagamento novo (registrar pagamento depois de cancelar é erro
// operacional).

import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, NotFoundError, ValidationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { getOrderById } from "models/order";
import { createPayment, listPaymentsByOrder } from "models/payment";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

async function loadOrderForCompany(slug: string, id: string) {
  const company = await getCompanyBySlug(slug);
  const order = await getOrderById(id);
  if (order.company_id !== company.id) {
    throw new NotFoundError({ message: "Pedido não encontrado." });
  }
  return { company, order };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const { company, order } = await loadOrderForCompany(slug, id);
    await canRequest("read:payment", { companyId: company.id });
    const payments = await listPaymentsByOrder(order.id);
    return NextResponse.json(payments);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const { company, order } = await loadOrderForCompany(slug, id);
    const { user } = await canRequest("create:payment", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    if (order.status === "cancelado") {
      throw new ValidationError({
        message: "Pedido cancelado não aceita pagamento.",
        action: "Reabra o pedido antes (não suportado no MVP) ou cadastre como avulso.",
      });
    }

    const body = await request.json();
    const created = await createPayment({
      companyId: company.id,
      orderId: order.id,
      amountCents: body?.amount_cents,
      method: body?.method,
      paidAt: typeof body?.paid_at === "string" ? new Date(body.paid_at) : null,
      notes: typeof body?.notes === "string" ? body.notes : null,
      createdBy: user.id,
    });

    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "payment.created",
      targetType: "payment",
      targetId: created.id,
      metadata: {
        order_id: order.id,
        amount_cents: created.amount_cents,
        method: created.method,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
