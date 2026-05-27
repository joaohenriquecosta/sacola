// Lista de pedidos da empresa. Gated por read:order. Linha mostra cliente
// + total + status; clicar abre /pedidos/[id] (próxima fatia).
// Por enquanto só listagem + criar — transitions de status entram na PR
// de lifecycle (issue #12).

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCentsBRL } from "@/lib/format-money";
import { ORDER_STATUS_BADGE_CLASS, ORDER_STATUS_LABEL_PT_BR } from "@/lib/order-labels";
import { listClientsByCompany } from "models/client";
import { getCompanyBySlug } from "models/company";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getMembership } from "models/membership";
import { listOrdersByCompany } from "models/order";
import { listProductsByCompany } from "models/product";
import { CreateOrderButton } from "./create-order-button";

type Params = Promise<{ slug: string }>;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function PedidosPage({ params }: { params: Params }) {
  const { slug } = await params;
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

  const canCreate = membership.features.includes("create:order");

  const orders = await listOrdersByCompany(company.id);
  // Pra criar pedido o user precisa de uma lista de clientes + produtos.
  // Carrega em paralelo só se ele pode criar.
  const [clients, products] = canCreate
    ? await Promise.all([listClientsByCompany(company.id), listProductsByCompany(company.id)])
    : [[], []];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          <p className="text-muted-foreground text-sm">{company.name}</p>
        </div>
        {canCreate && (
          <CreateOrderButton
            slug={company.slug}
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              unit: p.unit,
              price_cents: p.price_cents,
            }))}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>
            {orders.length === 0
              ? "Nenhum pedido ainda."
              : `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}.`}
          </CardDescription>
        </CardHeader>
        {orders.length > 0 && (
          <CardContent className="space-y-2">
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/app/${company.slug}/pedidos/${o.id}`}
                className="border-border hover:border-foreground/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.client_name}</p>
                  <p className="text-muted-foreground text-xs">
                    {dateFormatter.format(new Date(o.created_at))} · {o.item_count}{" "}
                    {o.item_count === 1 ? "item" : "itens"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_BADGE_CLASS[o.status]}`}
                  >
                    {ORDER_STATUS_LABEL_PT_BR[o.status]}
                  </span>
                  <span className="font-medium">{formatCentsBRL(o.total_cents)}</span>
                </div>
              </Link>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
