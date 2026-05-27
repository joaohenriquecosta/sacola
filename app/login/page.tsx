// Login form. POSTs to /api/v1/sessions; on success the API sets the session
// cookie and we redirect to /app. Anti-enumeration: 401 is rendered with the
// same generic message the API returns.

import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCurrentUser } from "infra/controller";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
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
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Use o email e a senha da sua conta.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
            <p className="text-muted-foreground mt-6 text-center text-sm">
              Não tem conta ainda?{" "}
              <Link href="/cadastro" className="text-foreground underline underline-offset-4">
                Criar conta
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
