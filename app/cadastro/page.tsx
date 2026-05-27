// Account registration form. POSTs to /api/v1/users and on success sends the
// user to the "check your email" page with the email pre-rendered so they
// know where the link is going.

import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCurrentUser } from "infra/controller";
import { RegistrationForm } from "./registration-form";

export default async function CadastroPage() {
  const { user } = await loadCurrentUser();
  if (user) redirect("/app");

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
            <CardTitle>Criar conta</CardTitle>
            <CardDescription>Você receberá um link de ativação no seu email.</CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationForm />
            <p className="text-muted-foreground mt-6 text-center text-sm">
              Já tem conta?{" "}
              <Link href="/login" className="text-foreground underline underline-offset-4">
                Entrar
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
