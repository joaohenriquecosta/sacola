// Chrome for the account-level routes (/app, /app/criar, /conta) — the ones
// with no company context, so no sidebar. Extracted from the old authed
// layout so those pages keep their simple top bar while the in-company routes
// use AppShell instead.

import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "./logout-button";

export function AccountFrame({ children }: { children: React.ReactNode }) {
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
