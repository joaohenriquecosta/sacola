"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ResendActivationButton } from "@/components/resend-activation-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldError = { message: string; action?: string };

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FieldError | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (res.status === 201) {
        router.push("/app");
        router.refresh();
        return;
      }
      setError({ message: body.message ?? "Erro inesperado.", action: body.action });
    } catch {
      setError({
        message: "Não foi possível autenticar.",
        action: "Verifique sua conexão e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
          disabled={loading}
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
          disabled={loading}
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

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
