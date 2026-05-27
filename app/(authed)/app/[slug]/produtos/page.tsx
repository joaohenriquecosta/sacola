// Catálogo de produtos da empresa. Gated por read:product no nível da page
// (notFound se o user não tem essa permissão na empresa). Controles de
// criar/editar/remover renderizados só quando o membership.features cobre.

import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";
import { listProductsByCompany } from "models/product";
import { CreateProductButton } from "./create-product-button";
import { ProductRow } from "./product-row";

type Params = Promise<{ slug: string }>;

export default async function ProdutosPage({ params }: { params: Params }) {
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
  if (!membership || !membership.features.includes("read:product")) notFound();

  const canCreate = membership.features.includes("create:product");
  const canUpdate = membership.features.includes("update:product");
  const canDelete = membership.features.includes("delete:product");

  const products = await listProductsByCompany(company.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground text-sm">{company.name}</p>
        </div>
        {canCreate && <CreateProductButton slug={company.slug} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            {products.length === 0
              ? "Nenhum produto cadastrado ainda."
              : `${products.length} ${products.length === 1 ? "item" : "itens"}.`}
          </CardDescription>
        </CardHeader>
        {products.length > 0 && (
          <CardContent className="space-y-2">
            {products.map((p) => (
              <ProductRow
                key={p.id}
                slug={company.slug}
                id={p.id}
                name={p.name}
                priceCents={p.price_cents}
                unit={p.unit}
                canUpdate={canUpdate}
                canDelete={canDelete}
              />
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
