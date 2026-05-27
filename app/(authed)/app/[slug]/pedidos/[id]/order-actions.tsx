"use client";

// Ações de pedido. O server (page.tsx) calcula `availableTargets` pela
// interseção (matriz de transições válidas a partir do estado atual ×
// features do membership). UI só renderiza o que o server liberou; o
// próprio API faz o mesmo check, então um botão escondido continua 403
// se chamado direto.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL_PT_BR } from "@/lib/order-labels";
import type { OrderStatus } from "@/lib/order-status";

type Props = {
  slug: string;
  orderId: string;
  availableTargets: readonly OrderStatus[];
  canDelete: boolean;
};

const ACTION_VERB: Record<OrderStatus, string> = {
  criado: "Reabrir",
  separado: "Marcar como separado",
  entregue: "Marcar como entregue",
  cancelado: "Cancelar pedido",
};

export function OrderActions({ slug, orderId, availableTargets, canDelete }: Props) {
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
        { method: "DELETE" },
      );
      router.push(`/app/${slug}/pedidos`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {availableTargets.map((target) => (
          <Button
            key={target}
            variant={target === "cancelado" ? "outline" : "default"}
            size="sm"
            disabled={busy}
            onClick={() => moveTo(target)}
          >
            {ACTION_VERB[target] ?? `Marcar como ${ORDER_STATUS_LABEL_PT_BR[target].toLowerCase()}`}
          </Button>
        ))}
      </div>
      {canDelete && (
        <Button variant="destructive" size="sm" disabled={busy} onClick={remove}>
          Excluir pedido
        </Button>
      )}
    </div>
  );
}
