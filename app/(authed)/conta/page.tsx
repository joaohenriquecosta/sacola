// Profile page. Shows the bits of the user's record the API would return
// from GET /api/v1/user (we already have them in `loadCurrentUser` so we
// skip the round-trip) plus the user's company memberships.

import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabel } from "@/lib/role-labels";
import { type Role } from "@/lib/roles";
import { loadCurrentUser } from "infra/controller";
import { listCompaniesForUser } from "models/company";

// IANA timezone — don't read from process.env.TZ here. On Vercel the var
// is exposed as POSIX-style (":UTC") which Intl.DateTimeFormat rejects.
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function ContaPage() {
  const { user } = await loadCurrentUser();
  if (!user) redirect("/login");

  const companies = await listCompaniesForUser(user.id);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sua conta</CardTitle>
          <CardDescription>Os dados públicos da sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[120px_1fr]">
            <dt className="text-muted-foreground">Username</dt>
            <dd>{user.username}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">Criada em</dt>
            <dd>{dateFormatter.format(new Date(user.created_at))}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suas empresas</CardTitle>
          <CardDescription>
            {companies.length === 0
              ? "Você ainda não pertence a nenhuma empresa."
              : `${companies.length} ${companies.length === 1 ? "vínculo" : "vínculos"}.`}
          </CardDescription>
        </CardHeader>
        {companies.length > 0 && (
          <CardContent className="space-y-2">
            {companies.map((c) => (
              <Link
                key={c.id}
                href={`/app/${c.slug}`}
                className="border-border hover:border-foreground/30 flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground text-xs">{roleLabel(c.role as Role)}</span>
              </Link>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
