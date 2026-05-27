"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ClientDialog } from "./client-dialog";

type Props = {
  slug: string;
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  canUpdate: boolean;
  canDelete: boolean;
};

export function ClientRow({ slug, id, name, phone, notes, canUpdate, canDelete }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Remover "${name}" da carteira?`)) return;
    setBusy(true);
    try {
      await fetch(
        `/api/v1/companies/${encodeURIComponent(slug)}/clients/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="text-muted-foreground text-xs">{phone ?? "sem telefone"}</p>
      </div>
      {(canUpdate || canDelete) && (
        <div className="flex shrink-0 items-center gap-2">
          {canUpdate && (
            <ClientDialog
              slug={slug}
              initial={{ id, name, phone, notes }}
              trigger={
                <Button variant="outline" size="sm">
                  Editar
                </Button>
              }
            />
          )}
          {canDelete && (
            <Button variant="destructive" size="sm" disabled={busy} onClick={remove}>
              Remover
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
