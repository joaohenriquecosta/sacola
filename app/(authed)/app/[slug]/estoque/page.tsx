// Estoque: saldo atual por produto + movimentações recentes. Gated por
// read:stock_movement. Lançar movimento e estornar gated por features
// específicas.

import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STOCK_MOVEMENT_KIND_LABEL_PT_BR } from "@/lib/stock-kind";
import { getCompanyBySlug } from "models/company";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getMembership } from "models/membership";
import { listProductsByCompany } from "models/product";
import { listBalancesByCompany, listMovementsByCompany } from "models/stock";
import { CreateMovementButton } from "./create-movement-button";
import { MovementRow } from "./movement-row";

type Params = Promise<{ slug: string }>;

const qtyFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function EstoquePage({ params }: { params: Params }) {
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
  if (!membership || !membership.features.includes("read:stock_movement")) notFound();

  const canCreate = membership.features.includes("create:stock_movement");
  const canDelete = membership.features.includes("delete:stock_movement");

  const [balances, movements, products] = await Promise.all([
    listBalancesByCompany(company.id),
    listMovementsByCompany(company.id),
    canCreate ? listProductsByCompany(company.id) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
          <p className="text-muted-foreground text-sm">{company.name}</p>
        </div>
        {canCreate && (
          <CreateMovementButton
            slug={company.slug}
            products={products.map((p) => ({ id: p.id, name: p.name, unit: p.unit }))}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldo atual</CardTitle>
          <CardDescription>
            {balances.length === 0
              ? "Cadastre produtos para acompanhar o estoque."
              : `${balances.length} ${balances.length === 1 ? "produto" : "produtos"} no catálogo.`}
          </CardDescription>
        </CardHeader>
        {balances.length > 0 && (
          <CardContent className="space-y-2">
            {balances.map((b) => (
              <div
                key={b.product_id}
                className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.product_name}</p>
                  <p className="text-muted-foreground text-xs">{b.product_unit}</p>
                </div>
                <span
                  className={`font-semibold ${b.balance < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                >
                  {qtyFormatter.format(b.balance)} {b.product_unit}
                </span>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimentações</CardTitle>
          <CardDescription>
            {movements.length === 0
              ? "Nenhuma movimentação registrada."
              : `${movements.length} ${movements.length === 1 ? "lançamento" : "lançamentos"}.`}
          </CardDescription>
        </CardHeader>
        {movements.length > 0 && (
          <CardContent className="space-y-2">
            {movements.map((m) => (
              <MovementRow
                key={m.id}
                slug={company.slug}
                id={m.id}
                productName={m.product_name}
                productUnit={m.product_unit}
                kindLabel={STOCK_MOVEMENT_KIND_LABEL_PT_BR[m.kind]}
                kind={m.kind}
                quantity={m.quantity}
                delta={m.delta}
                reason={m.reason}
                createdAt={dateFormatter.format(new Date(m.created_at))}
                canDelete={canDelete}
              />
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
