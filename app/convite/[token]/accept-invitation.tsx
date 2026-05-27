"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldError = { message: string; action?: string };

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
  const [error, setError] = useState<FieldError | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(body?: { username: string; password: string }) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const responseBody = await res.json().catch(() => ({}));
      if (res.status === 201) {
        router.push(`/app/${responseBody.slug ?? redirectSlug}`);
        router.refresh();
        return;
      }
      setError({
        message: responseBody.message ?? "Não foi possível aceitar o convite.",
        action: responseBody.action,
      });
    } catch {
      setError({
        message: "Não foi possível aceitar o convite.",
        action: "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  if (mode === "accept") {
    return (
      <div className="space-y-3">
        <Button className="w-full" disabled={loading} onClick={() => submit()}>
          {loading ? "Aceitando..." : `Aceitar como ${email}`}
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
        submit({ username, password });
      }}
      className="space-y-4"
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
          disabled={loading}
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
          disabled={loading}
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

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Criando..." : "Criar conta e aceitar"}
      </Button>
    </form>
  );
}
