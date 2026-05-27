// Shared shell for authenticated routes (/app, /conta). Gate access here so
// nested pages can assume `loadCurrentUser()` returns a non-null user.

import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { loadCurrentUser } from "infra/controller";
import { LogoutButton } from "./logout-button";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const { user } = await loadCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/app" className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true">🛒</span>
            <span>Sacola</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/app" className="text-foreground hover:underline">
              Empresas
            </Link>
            <Link href="/conta" className="text-foreground hover:underline">
              Conta
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col px-6 py-8">{children}</main>
    </div>
  );
}
