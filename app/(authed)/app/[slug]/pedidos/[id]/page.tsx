// Detalhe do pedido. Server-rendered (RSC) com itens; ações (mudar
// status, excluir) viajam via componentes client que pulam pelo router
// refresh. Cross-tenant: 404 se o pedido não é da empresa do slug.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCentsBRL } from "@/lib/format-money";
import { ORDER_STATUS_BADGE_CLASS, ORDER_STATUS_LABEL_PT_BR } from "@/lib/order-labels";
import { availableTransitions } from "@/lib/order-status";
import { getClientById } from "models/client";
import { getCompanyBySlug } from "models/company";
import { getUserById } from "models/user";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getMembership } from "models/membership";
import { getOrderById } from "models/order";
import { listPaymentsByOrder } from "models/payment";
import { OrderActions } from "./order-actions";
import { PaymentsCard } from "./payments-card";

type Params = Promise<{ slug: string; id: string }>;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const qtyFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export default async function PedidoDetailPage({ params }: { params: Params }) {
  const { slug, id } = await params;
  const { user } = await loadCurrentUser();
  if (!user) redirect("/login");

  let company;
  try {
    company = await getCompanyBySlug(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const membership = await getMembership(user.id, company.id);
  if (!membership || !membership.features.includes("read:order")) notFound();

  let order;
  try {
    order = await getOrderById(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (order.company_id !== company.id) notFound();

  const [client, creator] = await Promise.all([
    getClientById(order.client_id).catch(() => null),
    getUserById(order.created_by).catch(() => null),
  ]);

  const transitions = availableTransitions(order.status, membership.features);
  const canDelete = membership.features.includes("delete:order");
  const canSeePayments = membership.features.includes("read:payment");
  const canCreatePayment = membership.features.includes("create:payment");
  const canDeletePayment = membership.features.includes("delete:payment");
  const payments = canSeePayments ? await listPaymentsByOrder(order.id) : [];
  const totalPaid = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const balanceDue = order.total_cents - totalPaid;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedido</h1>
          <p className="text-muted-foreground text-sm">
            <Link href={`/app/${company.slug}/pedidos`} className="underline underline-offset-4">
              ← Voltar
            </Link>
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_BADGE_CLASS[order.status]}`}
        >
          {ORDER_STATUS_LABEL_PT_BR[order.status]}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{client?.name ?? "Cliente removido"}</CardTitle>
          <CardDescription>
            Criado em {dateFormatter.format(new Date(order.created_at))} por{" "}
            {creator?.username ?? "usuário removido"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.product_name}</p>
                  <p className="text-muted-foreground text-xs">
                    {qtyFormatter.format(item.quantity)} {item.product_unit} ×{" "}
                    {formatCentsBRL(item.unit_price_cents)}
                  </p>
                </div>
                <span className="font-medium">{formatCentsBRL(item.subtotal_cents)}</span>
              </div>
            ))}
          </div>

          {order.notes && (
            <div className="text-muted-foreground border-t pt-3 text-sm">
              <span className="text-foreground font-medium">Observações:</span> {order.notes}
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-muted-foreground text-sm">Total</span>
            <span className="text-lg font-semibold">{formatCentsBRL(order.total_cents)}</span>
          </div>
        </CardContent>
      </Card>

      {canSeePayments && (
        <PaymentsCard
          slug={company.slug}
          orderId={order.id}
          orderStatus={order.status}
          totalCents={order.total_cents}
          totalPaidCents={totalPaid}
          balanceDueCents={balanceDue}
          payments={payments.map((p) => ({
            id: p.id,
            amount_cents: p.amount_cents,
            method: p.method,
            paid_at: p.paid_at.toISOString(),
            notes: p.notes,
          }))}
          canCreate={canCreatePayment}
          canDelete={canDeletePayment}
        />
      )}

      {(transitions.length > 0 || canDelete) && (
        <OrderActions
          slug={company.slug}
          orderId={order.id}
          availableTargets={transitions.map((t) => t.to)}
          canDelete={canDelete}
        />
      )}
    </div>
  );
}
