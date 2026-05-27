// Team management page. Members + pending invitations side by side; admin+
// controls (remove member / change role / revoke invite / send invite) are
// rendered only when the requester is allowed to use them.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabel } from "@/lib/role-labels";
import { loadCurrentUser } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { type Role } from "models/authorization";
import { getCompanyBySlug } from "models/company";
import { listInvitationsByCompany } from "models/invitation";
import { getMembership, listMembersByCompany } from "models/membership";
import { MemberRow } from "./member-row";
import { InvitationRow } from "./invitation-row";

type Params = Promise<{ slug: string }>;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

export default async function EquipePage({ params }: { params: Params }) {
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

  const myMembership = await getMembership(user.id, company.id);
  if (!myMembership) notFound();

  const canManage = myMembership.role === "owner" || myMembership.role === "admin";
  const members = await listMembersByCompany(company.id);
  const invitations = canManage ? await listInvitationsByCompany(company.id) : [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
          <p className="text-muted-foreground text-sm">
            <Link href={`/app/${company.slug}`} className="underline underline-offset-4">
              {company.name}
            </Link>
          </p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href={`/app/${company.slug}/equipe/convidar`}>Convidar</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "pessoa" : "pessoas"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              slug={company.slug}
              userId={m.user_id}
              username={m.username}
              role={m.role}
              roleLabel={roleLabel(m.role as Role)}
              canManage={canManage && m.role !== "owner" && m.user_id !== user.id}
            />
          ))}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Convites pendentes</CardTitle>
            <CardDescription>
              {invitations.length === 0
                ? "Nenhum convite aguardando aceitação."
                : `${invitations.length} ${invitations.length === 1 ? "convite" : "convites"} pendente${invitations.length === 1 ? "" : "s"}.`}
            </CardDescription>
          </CardHeader>
          {invitations.length > 0 && (
            <CardContent className="space-y-2">
              {invitations.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  slug={company.slug}
                  id={inv.id}
                  email={inv.email}
                  role={inv.role}
                  roleLabel={roleLabel(inv.role as Role)}
                  expiresAt={dateFormatter.format(new Date(inv.expires_at))}
                />
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
