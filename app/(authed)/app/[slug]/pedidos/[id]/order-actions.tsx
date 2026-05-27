"use client";

// Ações no detalhe de pedido. MVP: botões de transição livres (qualquer
// um com update:order pode mover pra qualquer estado). PR de lifecycle
// vai introduzir matriz de transições autorizadas por role-feature
// específica.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL_PT_BR } from "@/lib/order-labels";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";

type Props = {
  slug: string;
  orderId: string;
  status: OrderStatus;
  canUpdate: boolean;
  canDelete: boolean;
};

export function OrderActions({ slug, orderId, status, canUpdate, canDelete }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function moveTo(next: OrderStatus) {
    setBusy(true);
    try {
      await fetch(
        `/api/v1/companies/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        },
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Excluir este pedido? A ação não pode ser desfeita.")) return;
    setBusy(true);
    try {
      await fetch(
        `/api/v1/companies/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}`,
        {
          method: "DELETE",
        },
      );
      router.push(`/app/${slug}/pedidos`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {canUpdate ? (
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.filter((s) => s !== status).map((s) => (
            <Button key={s} variant="outline" size="sm" disabled={busy} onClick={() => moveTo(s)}>
              Marcar como {ORDER_STATUS_LABEL_PT_BR[s].toLowerCase()}
            </Button>
          ))}
        </div>
      ) : (
        <div />
      )}
      {canDelete && (
        <Button variant="destructive" size="sm" disabled={busy} onClick={remove}>
          Excluir pedido
        </Button>
      )}
    </div>
  );
}
