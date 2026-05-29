// Fila de separação: pedidos 'criado' aguardando o separador, em ordem de
// chegada (FIFO). Gated por transition:order:separar. A ação de separar +
// refresh vive em SeparationQueue (client). Pesagem por item e realtime
// entram em fatias seguintes (#19 weighing / #14 SSE).

import { notFound, redirect } from "next/navigation";

import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";
import { listOrdersByCompany } from "models/order";
import { SeparationQueue } from "./separation-queue";

type Params = Promise<{ slug: string }>;

export default async function SeparacaoPage({ params }: { params: Params }) {
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
  if (!membership || !membership.features.includes("transition:order:separar")) notFound();

  const all = await listOrdersByCompany(company.id);
  const queue = all
    .filter((o) => o.status === "criado")
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
        <h1 className="text-2xl font-semibold tracking-tight">Fila de separação</h1>
        <p className="text-muted-foreground text-sm">
          {queue.length === 0
            ? "Nenhum pedido aguardando."
            : `${queue.length} ${queue.length === 1 ? "pedido aguardando" : "pedidos aguardando"}.`}
        </p>
      </div>
      <SeparationQueue slug={company.slug} orders={queue} />
    </div>
  );
}
