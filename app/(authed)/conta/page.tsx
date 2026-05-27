// Profile page. Shows the bits of the user's record the API would return
// from GET /api/v1/user (we already have them in `loadCurrentUser` so we
// skip the round-trip).

import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCurrentUser } from "infra/controller";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: process.env.TZ ?? "America/Sao_Paulo",
});

export default async function ContaPage() {
  const { user } = await loadCurrentUser();
  if (!user) redirect("/login");

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
    </div>
  );
}
