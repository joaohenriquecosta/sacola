// Carteira de clientes da empresa. Gated por read:client no nível da page
// (notFound se o user não tem permissão). Botões de criar/editar/remover
// renderizados conforme as features do membership.

import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listClientsByCompany } from "models/client";
import { getCompanyBySlug } from "models/company";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getMembership } from "models/membership";
import { ClientRow } from "./client-row";
import { CreateClientButton } from "./create-client-button";

type Params = Promise<{ slug: string }>;

export default async function ClientesPage({ params }: { params: Params }) {
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
  if (!membership || !membership.features.includes("read:client")) notFound();

  const canCreate = membership.features.includes("create:client");
  const canUpdate = membership.features.includes("update:client");
  const canDelete = membership.features.includes("delete:client");

  const clients = await listClientsByCompany(company.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">{company.name}</p>
        </div>
        {canCreate && <CreateClientButton slug={company.slug} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Carteira</CardTitle>
          <CardDescription>
            {clients.length === 0
              ? "Nenhum cliente cadastrado ainda."
              : `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}.`}
          </CardDescription>
        </CardHeader>
        {clients.length > 0 && (
          <CardContent className="space-y-2">
            {clients.map((c) => (
              <ClientRow
                key={c.id}
                slug={company.slug}
                id={c.id}
                name={c.name}
                phone={c.phone}
                notes={c.notes}
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
