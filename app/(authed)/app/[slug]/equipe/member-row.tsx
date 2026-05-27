"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { type Role } from "@/lib/roles";
import { EditMemberDialog } from "./edit-member-dialog";

export function MemberRow({
  slug,
  userId,
  username,
  role,
  roleLabel,
  features,
  canManage,
}: {
  slug: string;
  userId: string;
  username: string;
  role: Role;
  roleLabel: string;
  features: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
    <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{username}</p>
        <p className="text-muted-foreground text-xs">{roleLabel}</p>
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-2">
          <EditMemberDialog
            slug={slug}
            userId={userId}
            username={username}
            role={role}
            features={features}
          />
          <Button variant="destructive" size="sm" disabled={busy} onClick={remove}>
            Remover
          </Button>
        </div>
      )}
    </div>
  );
}
