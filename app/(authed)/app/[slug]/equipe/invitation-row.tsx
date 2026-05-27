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

  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{email}</p>
        <p className="text-muted-foreground text-xs">
          {roleLabel} · expira em {expiresAt}
          <span className="sr-only"> ({role})</span>
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={revoke}>
        Revogar
      </Button>
    </div>
  );
}
