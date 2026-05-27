// Activation handler. The user clicked the link in the activation email.
// We PATCH the token endpoint to mark it consumed and upgrade the user's
// permissions; rendering the result inline (success/error) keeps the flow
// in one place without bouncing through the API directly.

import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ativador } from "./ativador";

type Params = Promise<{ token: string }>;

export default async function AtivarPage({ params }: { params: Params }) {
  const { token } = await params;

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
            <CardTitle>Ativação de conta</CardTitle>
          </CardHeader>
          <CardContent>
            <Ativador token={token} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
