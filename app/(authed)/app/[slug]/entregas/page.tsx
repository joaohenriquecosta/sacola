// Fila de entregas: pedidos 'separado' prontos pra sair, em ordem de chegada.
// Gated por transition:order:entregar. A ação de entregar + refresh vive em
// DeliveryQueue (client). Pagamento na porta é feito no detalhe do pedido;
// status intermediários (saiu/voltou) e realtime (#14) ficam pra depois.

import { notFound, redirect } from "next/navigation";

import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";
import { listOrdersByCompany } from "models/order";
import { DeliveryQueue } from "./delivery-queue";

type Params = Promise<{ slug: string }>;

export default async function EntregasPage({ params }: { params: Params }) {
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
  if (!membership || !membership.features.includes("transition:order:entregar")) notFound();

  const all = await listOrdersByCompany(company.id);
  const queue = all
    .filter((o) => o.status === "separado")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((o) => ({
      id: o.id,
      client_name: o.client_name,
      item_count: o.item_count,
      total_cents: o.total_cents,
      created_at: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at),
    }));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entregas</h1>
        <p className="text-muted-foreground text-sm">
          {queue.length === 0
            ? "Nenhum pedido pronto pra entrega."
            : `${queue.length} ${queue.length === 1 ? "pedido pronto" : "pedidos prontos"}.`}
        </p>
      </div>
      <DeliveryQueue slug={company.slug} orders={queue} />
    </div>
  );
}
