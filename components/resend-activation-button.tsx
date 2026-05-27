"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

// Pings POST /api/v1/activations to re-issue the activation email. The API
// always returns 202 (anti-enum), so we just show a generic confirmation
// regardless of whether the email exists or is already activated. Used on
// /cadastro/aguardando-ativacao, /login (after activation-required error),
// and /cadastro/ativar/[token] when the token is invalid.

type Props = {
  email: string;
  variant?: "default" | "outline";
  className?: string;
};

export function ResendActivationButton({ email, variant = "outline", className }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  async function onClick() {
    setState("loading");
    try {
      await fetch("/api/v1/activations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setState("done");
    }
  }

  if (state === "done") {
    return (
      <p className="text-muted-foreground text-sm">
        Se este email tem uma conta pendente de ativação, um novo link já está a caminho.
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={onClick}
      disabled={state === "loading" || !email}
    >
      {state === "loading" ? "Enviando..." : "Reenviar email de ativação"}
    </Button>
  );
}
