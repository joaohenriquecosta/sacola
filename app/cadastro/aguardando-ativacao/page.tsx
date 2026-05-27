// Post-registration interstitial. The activation email landed; the user
// only needs to click the link. Email is passed via query so we don't have
// to read from the session (the user was never logged in).

import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = Promise<{ email?: string }>;

export default async function AguardandoAtivacaoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { email } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true">🛒</span>
          <span>Sacola</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Verifique seu email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>Link enviado{email ? ` para ${email}` : ""}</AlertTitle>
              <AlertDescription>
                O link expira em 15 minutos. Se não estiver na caixa de entrada, verifique a pasta
                de spam.
              </AlertDescription>
            </Alert>
            <Button variant="outline" asChild className="w-full">
              <Link href="/login">Já ativei, ir para o login</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
