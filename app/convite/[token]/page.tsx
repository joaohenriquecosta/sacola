// Public invitation landing. Reads /api/v1/invitations/[token] on the server
// to render context (who invited, which company, role), then hands off to a
// client component that branches on session state: logged in + matching
// email → one-click accept; otherwise → register-and-accept inline form.

import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabel } from "@/lib/role-labels";
import { loadCurrentUser } from "infra/controller";
import { ValidationError } from "infra/errors";
import { getPublicInvitationView } from "models/invitation";
import { AcceptInvitation } from "./accept-invitation";

type Params = Promise<{ token: string }>;

export default async function ConvitePage({ params }: { params: Params }) {
  const { token } = await params;

  let view;
  try {
    view = await getPublicInvitationView(token);
  } catch (err) {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Convite inválido</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>
                {err instanceof ValidationError ? err.message : "Convite indisponível."}
              </AlertTitle>
              <AlertDescription>
                {err instanceof ValidationError
                  ? err.action
                  : "Solicite um novo convite ao administrador da empresa."}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { user } = await loadCurrentUser();
  const isLoggedInMatching = user != null && user.email.toLowerCase() === view.email.toLowerCase();
  const isLoggedInMismatch = user != null && !isLoggedInMatching;

  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Convite para {view.company.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">{view.invited_by.username}</span> convidou{" "}
            <span className="font-medium">{view.email}</span> a entrar em{" "}
            <span className="font-medium">{view.company.name}</span> como{" "}
            <span className="font-medium">{roleLabel(view.role)}</span>.
          </p>

          {isLoggedInMismatch && (
            <Alert variant="destructive">
              <AlertTitle>
                Você está logado como {user.email}, mas o convite é para {view.email}.
              </AlertTitle>
              <AlertDescription>
                <Link href="/login" className="underline underline-offset-4">
                  Faça login com a conta convidada
                </Link>{" "}
                ou peça um novo convite.
              </AlertDescription>
            </Alert>
          )}

          {!isLoggedInMismatch && (
            <AcceptInvitation
              token={token}
              email={view.email}
              redirectSlug={view.company.slug}
              mode={isLoggedInMatching ? "accept" : "register"}
            />
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true">🛒</span>
          <span>Sacola</span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">{children}</main>
    </div>
  );
}
