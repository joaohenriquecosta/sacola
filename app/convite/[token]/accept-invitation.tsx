"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormSubmit, type ErrorPayload } from "@/lib/use-form-submit";

export function AcceptInvitation({
  token,
  email,
  redirectSlug,
  mode,
}: {
  token: string;
  email: string;
  redirectSlug: string;
  mode: "accept" | "register";
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ErrorPayload | null>(null);
  const { submit, isPending } = useFormSubmit();
  const [requesting, setRequesting] = useState(false);

  const busy = requesting || isPending;

  async function trigger(body?: { username: string; password: string }) {
    setError(null);
    setRequesting(true);
    const result = await submit<{ slug?: string; message?: string; action?: string }>({
      request: async () => {
        const res = await fetch(`/api/v1/invitations/${encodeURIComponent(token)}/accept`, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      },
      success: (s) => s === 201,
      then: (responseBody) => {
        router.push(`/app/${responseBody.slug ?? redirectSlug}`);
        router.refresh();
      },
    });
    setRequesting(false);
    if (!result.ok) setError(result.error);
  }

  if (mode === "accept") {
    return (
      <div className="space-y-3" aria-busy={busy}>
        <Button className="w-full" disabled={busy} onClick={() => trigger()}>
          {busy ? (
            <>
              <Spinner /> Aceitando…
            </>
          ) : (
            `Aceitar como ${email}`
          )}
        </Button>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{error.message}</AlertTitle>
            {error.action && <AlertDescription>{error.action}</AlertDescription>}
          </Alert>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        trigger({ username, password });
      }}
      className="space-y-4"
      aria-busy={busy}
    >
      <p className="text-muted-foreground text-sm">
        Crie sua conta para aceitar o convite. O email <span className="font-medium">{email}</span>{" "}
        já foi verificado pelo link, então você entra logo após criar.
      </p>

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_]+"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <p className="text-muted-foreground text-xs">
          Mínimo 12 caracteres com pelo menos um caractere especial.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error.message}</AlertTitle>
          {error.action && <AlertDescription>{error.action}</AlertDescription>}
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? (
          <>
            <Spinner /> Criando…
          </>
        ) : (
          "Criar conta e aceitar"
        )}
      </Button>
    </form>
  );
}
