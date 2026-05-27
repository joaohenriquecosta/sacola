// Company dashboard. Mostly a navigator for now (members, settings); will
// host business widgets later. Role-gates the action links so members don't
// see admin-only options.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "infra/errors";
import { loadCurrentUser } from "infra/controller";
import { getCompanyBySlug } from "models/company";
import { getMembership, listMembersByCompany } from "models/membership";

const ROLE_LABEL: Record<string, string> = {
  owner: "Dono",
  admin: "Gerente",
  member: "Membro",
};

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

  const canManage = membership.role === "owner" || membership.role === "admin";
  const members = await listMembersByCompany(company.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <p className="text-muted-foreground text-sm">
            /{company.slug} · você é {ROLE_LABEL[membership.role] ?? membership.role}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" asChild>
            <Link href={`/app/${company.slug}/configuracoes`}>Configurações</Link>
          </Button>
        )}
      </div>

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
                <span className="text-muted-foreground">{ROLE_LABEL[m.role] ?? m.role}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
