"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ResendActivationButton } from "@/components/resend-activation-button";
import { Spinner } from "@/components/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);

  const busy = requesting || isPending;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequesting(true);
    const result = await submit<{ message?: string; action?: string }>({
      request: async () => {
        const res = await fetch("/api/v1/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      },
      success: (s) => s === 201,
      then: () => {
        router.push("/app");
        router.refresh();
      },
    });
    setRequesting(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={busy}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error.message}</AlertTitle>
          {error.action && <AlertDescription>{error.action}</AlertDescription>}
        </Alert>
      )}

      {/* Activation-required error → offer to reissue the link. The error
          message is the exact pt-BR string the API returns; we match on
          "ativada" rather than parsing structured fields. */}
      {error && /ativada/i.test(error.message) && (
        <ResendActivationButton email={email} variant="outline" className="w-full" />
      )}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? (
          <>
            <Spinner /> Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
