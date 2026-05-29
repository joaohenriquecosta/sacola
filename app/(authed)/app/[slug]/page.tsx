// Company overview: at-a-glance metrics. Navigation moved to the sidebar
// (AppShell), so this is no longer a menu of cards — it surfaces the numbers a
// manager wants on landing. Each metric is gated by the same feature as its
// sidebar item, so a member sees only what they can read.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabel } from "@/lib/role-labels";
import { type Role } from "@/lib/roles";
import { NotFoundError } from "infra/errors";
import { loadCurrentUser } from "infra/controller";
import { listClientsByCompany } from "models/client";
import { getCompanyBySlug } from "models/company";
import { getMembership, listMembersByCompany } from "models/membership";
import { listOrdersByCompany } from "models/order";
import { listProductsByCompany } from "models/product";
import { listBalancesByCompany } from "models/stock";

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

  const has = (feature: string) => membership.features.includes(feature);
  const canSeeOrders = has("read:order");
  const canSeeStock = has("read:stock_movement");
  const canSeeClients = has("read:client");
  const canSeeProducts = has("read:product");
  const canSeeMembers = has("read:member");

  const orders = canSeeOrders ? await listOrdersByCompany(company.id) : [];
  const stockBalances = canSeeStock ? await listBalancesByCompany(company.id) : [];
  const clients = canSeeClients ? await listClientsByCompany(company.id) : [];
  const products = canSeeProducts ? await listProductsByCompany(company.id) : [];
  const members = canSeeMembers ? await listMembersByCompany(company.id) : [];

  const openOrders = orders.filter((o) => o.status === "criado" || o.status === "separado").length;
  const lowStockCount = stockBalances.filter((b) => b.balance <= 0).length;
  const base = `/app/${company.slug}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-muted-foreground text-sm">
          Você é {roleLabel(membership.role as Role)} em {company.name}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canSeeOrders && (
          <MetricCard
            title="Pedidos abertos"
            value={openOrders}
            description={`${orders.length} no histórico`}
            href={`${base}/pedidos`}
          />
        )}
        {canSeeStock && (
          <MetricCard
            title="Estoque baixo"
            value={lowStockCount}
            description={lowStockCount === 0 ? "Tudo com saldo" : "Produtos sem saldo"}
            href={`${base}/estoque`}
          />
        )}
        {canSeeClients && (
          <MetricCard
            title="Clientes"
            value={clients.length}
            description="Na carteira"
            href={`${base}/clientes`}
          />
        )}
        {canSeeProducts && (
          <MetricCard
            title="Produtos"
            value={products.length}
            description="No catálogo"
            href={`${base}/produtos`}
          />
        )}
      </div>

      {canSeeMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Equipe</CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? "membro" : "membros"}
            </CardDescription>
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
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  href,
}: {
  title: string;
  value: number;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="hover:border-foreground/30 transition-colors">
        <CardHeader className="pb-2">
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
