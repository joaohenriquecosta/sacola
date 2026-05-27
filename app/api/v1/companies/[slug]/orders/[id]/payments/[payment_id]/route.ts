// Estorno de pagamento. Cross-tenant: payment precisa pertencer ao
// pedido que está na URL, que precisa pertencer à empresa do slug.

import { NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { AuthenticationError, NotFoundError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { getOrderById } from "models/order";
import { deletePayment, getPaymentById } from "models/payment";

type RouteContext = {
  params: Promise<{ slug: string; id: string; payment_id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { slug, id, payment_id } = await context.params;
    const company = await getCompanyBySlug(slug);
    const { user } = await canRequest("delete:payment", { companyId: company.id });
    if (!user) throw new AuthenticationError();

    const order = await getOrderById(id);
    if (order.company_id !== company.id) {
      throw new NotFoundError({ message: "Pedido não encontrado." });
    }

    const payment = await getPaymentById(payment_id);
    if (payment.order_id !== order.id || payment.company_id !== company.id) {
      throw new NotFoundError({ message: "Pagamento não encontrado." });
    }

    await deletePayment(payment.id);
    await logSafe({
      companyId: company.id,
      actorId: user.id,
      action: "payment.deleted",
      targetType: "payment",
      targetId: payment.id,
      metadata: {
        order_id: order.id,
        amount_cents: payment.amount_cents,
        method: payment.method,
      },
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorToResponse(err);
  }
}
