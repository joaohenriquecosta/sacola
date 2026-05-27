"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ResendActivationButton } from "@/components/resend-activation-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "error"; message: string; action?: string };

export function Ativador({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  // Email is only needed in the error path (to offer a resend). We keep it
  // here in the parent because re-keying it inside the error branch would
  // remount on every keystroke.
  const [email, setEmail] = useState("");
  // StrictMode mounts effects twice in dev; we'd hit the endpoint twice and
  // burn the (now-used) token before the user even sees the success state.
  // Guarding by ref keeps the call effectively-once.
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;

    fetch(`/api/v1/activations/${encodeURIComponent(token)}`, { method: "PATCH" })
      .then(async (res) => {
        if (res.status === 200) {
          setStatus({ kind: "ok" });
          return;
        }
        const body = await res.json().catch(() => ({}));
        setStatus({
          kind: "error",
          message: body.message ?? "Não foi possível ativar a conta.",
          action: body.action,
        });
      })
      .catch(() =>
        setStatus({
          kind: "error",
          message: "Não foi possível ativar a conta.",
          action: "Verifique sua conexão e tente novamente.",
        }),
      );
  }, [token]);

  if (status.kind === "loading") {
    return <p className="text-muted-foreground text-sm">Ativando sua conta…</p>;
  }

  if (status.kind === "ok") {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertTitle>Conta ativada!</AlertTitle>
          <AlertDescription>Agora você pode entrar.</AlertDescription>
        </Alert>
        <Button asChild className="w-full">
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTitle>{status.message}</AlertTitle>
        {status.action && <AlertDescription>{status.action}</AlertDescription>}
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="resend-email">Reenviar email de ativação</Label>
        <Input
          id="resend-email"
          type="email"
          placeholder="seu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <ResendActivationButton email={email} className="w-full" />
        <p className="text-muted-foreground text-xs">
          Já tem conta ativa?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Entrar
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
