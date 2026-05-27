"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function InvitationRow({
  slug,
  id,
  email,
  role,
  roleLabel,
  expiresAt,
}: {
  slug: string;
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  expiresAt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function revoke() {
    if (!confirm(`Revogar o convite para ${email}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/companies/${slug}/invitations/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/v1/companies/${slug}/invitations/${id}/resend`, {
        method: "POST",
      });
      if (res.status === 202) {
        setFeedback("Convite reenviado.");
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setFeedback(body.message ?? "Não foi possível reenviar.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{email}</p>
        <p className="text-muted-foreground text-xs">
          {roleLabel} · expira em {expiresAt}
          <span className="sr-only"> ({role})</span>
          {feedback && <span className="text-foreground ml-2">{feedback}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={resend}>
          Reenviar
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={revoke}>
          Revogar
        </Button>
      </div>
    </div>
  );
}
