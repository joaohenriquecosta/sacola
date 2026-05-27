// Company dashboard. Mostly a navigator for now (members, settings); will
// host business widgets later. Role-gates the action links so members don't
// see admin-only options.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabel } from "@/lib/role-labels";
import { isManagementRole, type Role } from "@/lib/roles";
import { NotFoundError } from "infra/errors";
import { loadCurrentUser } from "infra/controller";
import { listClientsByCompany } from "models/client";
import { getCompanyBySlug } from "models/company";
import { getMembership, listMembersByCompany } from "models/membership";
import { listOrdersByCompany } from "models/order";
import { listProductsByCompany } from "models/product";

type Params = Promise<{ slug: string }>;

export default async function CompanyPage({ params }: { params: Params }) {
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
  if (!membership) notFound();

  const canManage = isManagementRole(membership.role);
  const canSeeProducts = membership.features.includes("read:product");
  const canSeeClients = membership.features.includes("read:client");
  const canSeeOrders = membership.features.includes("read:order");
  const members = await listMembersByCompany(company.id);
  const products = canSeeProducts ? await listProductsByCompany(company.id) : [];
  const clients = canSeeClients ? await listClientsByCompany(company.id) : [];
  const orders = canSeeOrders ? await listOrdersByCompany(company.id) : [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <p className="text-muted-foreground text-sm">
            /{company.slug} · você é {roleLabel(membership.role as Role)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button variant="outline" asChild>
              <Link href={`/app/${company.slug}/auditoria`}>Auditoria</Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={`/app/${company.slug}/configuracoes`}>
              {canManage ? "Configurações" : "Sair da empresa"}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Equipe</CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? "membro" : "membros"}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/app/${company.slug}/equipe`}>{canManage ? "Gerenciar" : "Ver tudo"}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span>{m.username}</span>
                <span className="text-muted-foreground">{roleLabel(m.role as Role)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canSeeProducts && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Produtos</CardTitle>
              <CardDescription>
                {products.length === 0
                  ? "Nenhum produto cadastrado."
                  : `${products.length} ${products.length === 1 ? "item" : "itens"} no catálogo.`}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/${company.slug}/produtos`}>
                {membership.features.includes("create:product") ? "Gerenciar" : "Ver tudo"}
              </Link>
            </Button>
          </CardHeader>
        </Card>
      )}

      {canSeeClients && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Clientes</CardTitle>
              <CardDescription>
                {clients.length === 0
                  ? "Nenhum cliente cadastrado."
                  : `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"} na carteira.`}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/${company.slug}/clientes`}>
                {membership.features.includes("create:client") ? "Gerenciar" : "Ver tudo"}
              </Link>
            </Button>
          </CardHeader>
        </Card>
      )}

      {canSeeOrders && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Pedidos</CardTitle>
              <CardDescription>
                {orders.length === 0
                  ? "Nenhum pedido ainda."
                  : `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"} no histórico.`}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/${company.slug}/pedidos`}>
                {membership.features.includes("create:order") ? "Gerenciar" : "Ver tudo"}
              </Link>
            </Button>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
