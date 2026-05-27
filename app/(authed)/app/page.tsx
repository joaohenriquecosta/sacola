// Authenticated home: lists the companies the user belongs to and links to
// the company dashboards. Reads directly from `listCompaniesForUser` since
// we're already on the server; the API exists for the browser flows.

import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCurrentUser } from "infra/controller";
import { listCompaniesForUser } from "models/company";

const ROLE_LABEL: Record<string, string> = {
  owner: "Dono",
  admin: "Gerente",
  member: "Membro",
};

export default async function AppPage() {
  const { user } = await loadCurrentUser();
  if (!user) redirect("/login");

  const companies = await listCompaniesForUser(user.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Suas empresas</h1>
        <Button asChild>
          <Link href="/app/criar">Criar empresa</Link>
        </Button>
      </div>

      {companies.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma empresa ainda</CardTitle>
            <CardDescription>
              Crie uma empresa para começar a gerenciar membros e operações.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {companies.map((c) => (
            <li key={c.id}>
              <Link href={`/app/${c.slug}`} className="block">
                <Card className="hover:border-foreground/30 transition-colors">
                  <CardHeader>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>{ROLE_LABEL[c.role] ?? c.role}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm">/{c.slug}</p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
