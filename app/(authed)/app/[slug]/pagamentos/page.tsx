// Seção de pagamentos consolidada (#21): todos os pagamentos da empresa numa
// visão só (hoje registrados por pedido), com cliente, valor e método. Gated
// por read:payment. Registrar/estornar continua no detalhe do pedido.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { formatCentsBRL } from "@/lib/format-money";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";
import { listPaymentsByCompany } from "models/payment";

type Params = Promise<{ slug: string }>;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function PagamentosPage({ params }: { params: Params }) {
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
  if (!membership || !membership.features.includes("read:payment")) notFound();

  const payments = await listPaymentsByCompany(company.id);
  const total = payments.reduce((sum, p) => sum + p.amount_cents, 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
        <p className="text-muted-foreground text-sm">
          {payments.length === 0
            ? "Nenhum pagamento registrado."
            : `${payments.length} ${payments.length === 1 ? "pagamento" : "pagamentos"} · ${formatCentsBRL(total)} recebidos.`}
        </p>
      </div>

      {payments.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            {payments.map((p) => (
              <Link
                key={p.id}
                href={`/app/${company.slug}/pedidos/${p.order_id}`}
                className="border-border hover:border-foreground/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.client_name}</p>
                  <p className="text-muted-foreground text-xs">
                    {dateFormatter.format(new Date(p.paid_at))} · {p.method}
                  </p>
                </div>
                <span className="font-medium">{formatCentsBRL(p.amount_cents)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
