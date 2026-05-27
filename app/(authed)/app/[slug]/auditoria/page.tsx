// Audit log viewer. admin+ only — the membership lookup also confirms
// the requester is a member of this company at all.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeAuditEvent } from "@/lib/audit-log-labels";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { listAuditEventsByCompany } from "models/audit-log";
import { getCompanyBySlug } from "models/company";
import { getMembership } from "models/membership";

type Params = Promise<{ slug: string }>;

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function AuditoriaPage({ params }: { params: Params }) {
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
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    notFound();
  }

  const events = await listAuditEventsByCompany(company.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-muted-foreground text-sm">
          Histórico das ações de gerenciamento de{" "}
          <Link href={`/app/${company.slug}`} className="underline underline-offset-4">
            {company.name}
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recentes</CardTitle>
          <CardDescription>
            {events.length === 0
              ? "Nenhum evento registrado ainda."
              : `Mostrando ${events.length} ${events.length === 1 ? "evento" : "eventos"} mais recente${events.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        {events.length > 0 && (
          <CardContent className="space-y-2">
            {events.map((e) => (
              <div
                key={e.id}
                className="border-border flex flex-col gap-1 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <p>{describeAuditEvent(e)}</p>
                <time
                  dateTime={new Date(e.created_at).toISOString()}
                  className="text-muted-foreground shrink-0 text-xs"
                >
                  {dateTimeFormatter.format(new Date(e.created_at))}
                </time>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
