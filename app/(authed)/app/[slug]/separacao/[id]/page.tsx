// Per-order separation screen (#19): the separador weighs each item and
// finalizes (criado → separado). Gated by transition:order:separar.

import { notFound, redirect } from "next/navigation";

import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";
import { getOrderById } from "models/order";
import { WeighingForm } from "./weighing-form";

type Params = Promise<{ slug: string; id: string }>;

export default async function SepararPedidoPage({ params }: { params: Params }) {
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
  if (!membership || !membership.features.includes("transition:order:separar")) notFound();

  let order;
  try {
    order = await getOrderById(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (order.company_id !== company.id) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Separar pedido</h1>
        <p className="text-muted-foreground text-sm">
          Pese cada item e finalize. O peso é opcional por item.
        </p>
      </div>

      <WeighingForm
        slug={company.slug}
        orderId={order.id}
        canFinalize={order.status === "criado"}
        items={order.items.map((i) => ({
          id: i.id,
          product_name: i.product_name,
          product_unit: i.product_unit,
          quantity: i.quantity,
          gramas_separado: i.gramas_separado,
        }))}
      />
    </div>
  );
}
