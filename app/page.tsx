// Landing page. If the visitor already has a valid session, send them to the
// authenticated app. Otherwise show entry/sign-up CTAs.

import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { loadCurrentUser } from "infra/controller";

export default async function Home() {
  const { user } = await loadCurrentUser();
  if (user) redirect("/app");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true">🛒</span>
          <span>Sacola</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Sacola</h1>
          <p className="text-muted-foreground mt-3 text-sm">
            Gestão operacional para hortifruti — pedidos, separação e entrega.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link href="/cadastro">Criar conta</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/login">Entrar</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
