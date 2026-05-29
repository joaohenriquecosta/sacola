// Lista de pedidos da empresa. Gated por read:order. Quem cria pedido
// (vendedor/gerente) ganha um filtro "meus pedidos" (own orders). O render +
// filtro vivem em OrdersList (client); a página só resolve acesso e dados.

import { notFound, redirect } from "next/navigation";

import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { listClientsByCompany } from "models/client";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";
import { listOrdersByCompany } from "models/order";
import { listProductsByCompany } from "models/product";
import { CreateOrderButton } from "./create-order-button";
import { OrdersList } from "./orders-list";

type Params = Promise<{ slug: string }>;

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

  const rows = orders.map((o) => ({
    id: o.id,
    client_name: o.client_name,
    item_count: o.item_count,
    status: o.status,
    total_cents: o.total_cents,
    created_at: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
    created_by: o.created_by,
  }));

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

      <OrdersList
        slug={company.slug}
        orders={rows}
        currentUserId={user.id}
        canFilterMine={canCreate}
      />
    </div>
  );
}
