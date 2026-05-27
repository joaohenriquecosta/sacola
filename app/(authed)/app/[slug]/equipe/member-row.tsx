"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Role = "owner" | "admin" | "member";

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

  async function changeRole(next: "admin" | "member") {
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
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{username}</p>
        <p className="text-muted-foreground text-xs">{roleLabel}</p>
      </div>
      {canManage && (
        <div className="flex items-center gap-2">
          {role !== "admin" && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => changeRole("admin")}>
              Promover
            </Button>
          )}
          {role === "admin" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => changeRole("member")}
            >
              Rebaixar
            </Button>
          )}
          <Button variant="destructive" size="sm" disabled={busy} onClick={remove}>
            Remover
          </Button>
        </div>
      )}
    </div>
  );
}
