"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { StockMovementKind } from "@/lib/stock-kind";

type Props = {
  slug: string;
  id: string;
  productName: string;
  productUnit: string;
  kindLabel: string;
  kind: StockMovementKind;
  quantity: number;
  delta: number;
  reason: string | null;
  createdAt: string;
  canDelete: boolean;
};

const qtyFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

const KIND_BADGE: Record<StockMovementKind, string> = {
  in: "bg-green-500/10 text-green-700 dark:text-green-300",
  out: "bg-red-500/10 text-red-700 dark:text-red-300",
  adjust: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
};

export function MovementRow({
  slug,
  id,
  productName,
  productUnit,
  kindLabel,
  kind,
  delta,
  reason,
  createdAt,
  canDelete,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Estornar este movimento? O saldo será recalculado.")) return;
    setBusy(true);
    try {
      await fetch(
        `/api/v1/companies/${encodeURIComponent(slug)}/stock/movements/${encodeURIComponent(id)}`,
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
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[kind]}`}>
            {kindLabel}
          </span>
          <span className="truncate font-medium">{productName}</span>
        </div>
        <p className="text-muted-foreground text-xs">
          {createdAt}
          {reason && ` · ${reason}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`font-semibold ${delta < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}
        >
          {delta > 0 ? "+" : ""}
          {qtyFormatter.format(delta)} {productUnit}
        </span>
        {canDelete && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove} aria-label="Estornar">
            ✕
          </Button>
        )}
      </div>
    </div>
  );
}
