"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ROLE_LABEL_PT_BR } from "@/lib/role-labels";
import { ASSIGNABLE_ROLES, type Role } from "@/lib/roles";

export function MemberRow({
  slug,
  userId,
  username,
  role,
  roleLabel,
  canManage,
}: {
  slug: string;
  userId: string;
  username: string;
  role: Role;
  roleLabel: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function changeRole(next: Role) {
    if (next === role) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/companies/${slug}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remover ${username} da empresa?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/companies/${slug}/members/${userId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{username}</p>
        {!canManage && <p className="text-muted-foreground text-xs">{roleLabel}</p>}
      </div>
      {canManage ? (
        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => changeRole(e.target.value as Role)}
            disabled={busy}
            aria-label={`Função de ${username}`}
            className="border-input bg-transparent text-foreground h-8 rounded-md border px-2 text-xs"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL_PT_BR[r]}
              </option>
            ))}
          </select>
          <Button variant="destructive" size="sm" disabled={busy} onClick={remove}>
            Remover
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">{roleLabel}</span>
      )}
    </div>
  );
}
